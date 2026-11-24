import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Spinner } from '@/shadcn/spinner'
import { Switch } from '@/shadcn/switch'
import { toast } from '@/shadcn/toast'

import { AgentEmpty } from '../../../components/marketplace/agent-shared'
import { PluginAvatar } from '../../../components/marketplace/plugin-avatar'
import { useSettingsDetailStore } from '../../../components/marketplace/settings-detail-store'
import { SkillActions } from '../../../components/marketplace/skill-actions'
import { SkillDetailPage } from '../../../components/marketplace/skill-detail-page'
import {
  getAgentCapabilityToggles,
  listAgentSkills,
  setAgentCapabilityToggle,
} from '../../../services/claude/agent-config'

type SkillListProps = { onOpenMarketplace: () => void }

export function AgentSkillSettings({ onOpenMarketplace }: SkillListProps) {
  const view = useSettingsDetailStore((state) => state.view)
  if (view.kind === 'detail' && view.categoryId === 'agent-skills' && view.file) {
    return <SkillDetailPage key={view.file} name={view.file} />
  }
  return <SkillList onOpenMarketplace={onOpenMarketplace} />
}

function SkillList({ onOpenMarketplace }: SkillListProps) {
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const { t } = useTranslation()
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([])
  const [disabledSkills, setDisabledSkills] = useState<string[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const reload = async () => {
    try {
      const [skills, toggles] = await Promise.all([listAgentSkills(), getAgentCapabilityToggles()])
      setSkills(skills)
      setDisabledSkills(toggles.disabledSkills)
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

  const handleToggle = async (name: string, enabled: boolean) => {
    setIsSaving(true)
    try {
      const toggles = await setAgentCapabilityToggle('skill', name, enabled)
      setDisabledSkills(toggles.disabledSkills)
    } catch {
      toast.add({ id: 'agent-skill-toggle', title: t('settings.agent.saveError'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">
          {t('settings.agent.plugins.installed')}{' '}
          {!isLoading && (
            <span className="font-normal text-foreground-subtlest">{skills.length}</span>
          )}
        </h2>
        <Button
          variant="outline"
          aria-label={t('settings.agent.skillMarket.open')}
          title={t('settings.agent.skillMarket.open')}
          onClick={onOpenMarketplace}
        >
          Add
        </Button>
      </div>
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
                className="group/skill flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
                onClick={open}
              >
                <PluginAvatar name={skill.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{skill.name}</div>
                  <div className="truncate text-sm text-foreground-subtle">{skill.description}</div>
                </div>
                <div className="-mr-1" onClick={(event) => event.stopPropagation()}>
                  <SkillActions
                    name={skill.name}
                    className="pointer-events-none opacity-0 group-hover/skill:pointer-events-auto group-hover/skill:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                    onOpen={open}
                    onUninstall={reload}
                  />
                </div>
                <div className="flex" onClick={(event) => event.stopPropagation()}>
                  <Switch
                    aria-label={t('settings.agent.enabled')}
                    checked={!disabledSkills.includes(skill.name)}
                    disabled={isSaving}
                    onCheckedChange={(enabled) => void handleToggle(skill.name, enabled)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
