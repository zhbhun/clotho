import { EllipsisVertical } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/dropdown-menu'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'

import { deleteAgentSkill, listAgentSkills } from '../../../services/claude/agent-config'
import { AgentEmpty, DeleteConfirmDialog } from './agent-shared'
import { PluginAvatar } from './plugin-avatar'
import { useSettingsDetailStore } from './settings-detail-store'
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
  const [selected, setSelected] = useState<string | null>(null)
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

  const handleDelete = async (name: string) => {
    try {
      await deleteAgentSkill(name)
      await reload()
    } catch {
      toast.add({ id: 'agent-skill-delete', title: t('settings.agent.deleteError'), type: 'error' })
    }
  }

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
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={t('settings.agent.plugins.more') + ' · ' + skill.name}
                      render={<Button size="icon" variant="ghost" />}
                    >
                      <EllipsisVertical className="size-4 text-foreground-subtlest" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={open}>
                        {t('settings.agent.plugins.open')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setSelected(skill.name)}
                      >
                        {t('settings.agent.plugins.uninstall')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <DeleteConfirmDialog
        open={selected !== null}
        title={t('settings.agent.plugins.uninstall')}
        actionLabel={t('settings.agent.plugins.uninstall')}
        description={t('settings.agent.skills.confirmDelete', { name: selected })}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
        onDelete={() => {
          if (selected) return handleDelete(selected)
        }}
      />
    </section>
  )
}
