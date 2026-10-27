import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/shadcn/spinner'
import { Switch } from '@/shadcn/switch'
import { toast } from '@/shadcn/toast'

import {
  deleteAgentSkill,
  getAgentCapabilityToggles,
  listAgentSkills,
  setAgentCapabilityToggle,
} from '../../../services/claude/agent-config'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'

export function AgentSkillSettings() {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<Array<{ name: string; description: string }>>([])
  const [disabledSkills, setDisabledSkills] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const reload = async () => {
    try {
      const [list, toggles] = await Promise.all([listAgentSkills(), getAgentCapabilityToggles()])
      setSkills(list)
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
    try {
      const toggles = await setAgentCapabilityToggle('skill', name, enabled)
      setDisabledSkills(toggles.disabledSkills)
    } catch {
      toast.add({ id: 'agent-skill-toggle', title: t('settings.agent.saveError'), type: 'error' })
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteAgentSkill(name)
      await reload()
    } catch {
      toast.add({ id: 'agent-skill-delete', title: t('settings.agent.deleteError'), type: 'error' })
    }
  }

  return (
    <AgentSection titleKey="skills">
      <p className="text-sm text-foreground-subtle">{t('settings.agent.skills.addHint')}</p>
      {isLoading ? (
        <Spinner className="self-center" />
      ) : skills.length === 0 ? (
        <AgentEmpty />
      ) : (
        <div className="divide-y rounded-lg border">
          {skills.map((skill) => (
            <div className="flex min-h-14 items-center gap-3 px-4 py-2" key={skill.name}>
              <Switch
                aria-label={t('settings.agent.enabled')}
                checked={!disabledSkills.includes(skill.name)}
                onCheckedChange={(enabled) => void handleToggle(skill.name, enabled)}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-normal">{skill.name}</div>
                <div className="truncate text-sm text-foreground-subtle">{skill.description}</div>
              </div>
              <DeleteButton label={skill.name} onDelete={() => handleDelete(skill.name)} />
            </div>
          ))}
        </div>
      )}
    </AgentSection>
  )
}
