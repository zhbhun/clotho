import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'

import { listAgentSkills } from '../../../services/claude/agent-config'
import { AgentEmpty } from './agent-shared'
import { PluginAvatar } from './plugin-avatar'
import { useSettingsDetailStore } from './settings-detail-store'
import { SkillActions } from './skill-actions'
import { SkillDetailPage } from './skill-detail-page'

export function AgentSkillSettings() {
  const view = useSettingsDetailStore((state) => state.view)
  if (view.kind === 'detail' && view.categoryId === 'agent-skills' && view.file) {
    return <SkillDetailPage key={view.file} name={view.file} />
  }
  return <SkillList />
}

function SkillList() {
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const { t } = useTranslation()
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([])
  const [isLoading, setIsLoading] = useState(true)

  const reload = async () => {
    try {
      setSkills(await listAgentSkills())
    } catch {
      toast.add({ id: 'agent-skills-load', title: t('settings.agent.loadError'), type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">
        {t('settings.agent.plugins.installed')}{' '}
        {!isLoading && <span className="text-foreground-subtlest">{skills.length}</span>}
      </h2>
      {isLoading ? (
        <Spinner className="self-center" />
      ) : skills.length === 0 ? (
        <AgentEmpty />
      ) : (
        <div>
          {skills.map((skill) => {
            const open = () => openDetail('agent-skills', skill.name, skill.name)
            return (
              <div
                key={skill.name}
                className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
                onClick={open}
              >
                <PluginAvatar name={skill.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{skill.name}</div>
                  <div className="truncate text-sm text-foreground-subtle">{skill.description}</div>
                </div>
                <div onClick={(event) => event.stopPropagation()}>
                  <SkillActions name={skill.name} onOpen={open} onUninstall={reload} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
