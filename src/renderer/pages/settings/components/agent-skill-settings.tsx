import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'

import { deleteAgentSkill, listAgentSkills } from '../../../services/claude/agent-config'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'
import { SettingsList, SettingsRow } from './settings-list'

export function AgentSkillSettings() {
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
    <AgentSection titleKey="skills">
      <p className="text-sm text-foreground-subtle">{t('settings.agent.skills.addHint')}</p>
      {isLoading ? (
        <Spinner className="self-center" />
      ) : skills.length === 0 ? (
        <AgentEmpty />
      ) : (
        <SettingsList>
          {skills.map((skill) => (
            <SettingsRow className="gap-3" key={skill.name} variant="compact">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-normal">{skill.name}</div>
                <div className="truncate text-sm text-foreground-subtle">{skill.description}</div>
              </div>
              <DeleteButton
                description={t('settings.agent.skills.confirmDelete', { name: skill.name })}
                label={skill.name}
                onDelete={() => handleDelete(skill.name)}
              />
            </SettingsRow>
          ))}
        </SettingsList>
      )}
    </AgentSection>
  )
}
