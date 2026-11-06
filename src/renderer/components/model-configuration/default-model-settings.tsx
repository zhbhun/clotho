import { ChevronDown, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { FieldContent, FieldDescription, FieldLabel } from '@/shadcn/field'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import { cn } from '@/shadcn/utils'
import type { ClaudeModelRoleMapping } from '@/shared/rpc'

import { SettingsList, SettingsRow } from '../../pages/settings/components/settings-list'
import type { ModelProvider } from '../../services/claude/claude'
import {
  Menu,
  MenuContent,
  MenuEmpty,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuTrigger,
} from '../menu'
import { SettingsSection } from '../settings-section'

interface ModelChoice {
  value: string
  providerName: string
  modelName: string
}

type ModelMappingRole = keyof ClaudeModelRoleMapping

const MODEL_MAPPING_ROLES: ModelMappingRole[] = ['haiku', 'sonnet', 'opus']

function modelChoices(providers: ModelProvider[]): ModelChoice[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: `${provider.id}/${model.id}`,
      providerName: provider.name || provider.id,
      modelName: model.displayName || model.id,
    })),
  )
}

function ModelTargetPicker({
  id,
  value,
  providers,
  choices,
  disabled,
  onChange,
}: {
  id: string
  value?: string
  providers: ModelProvider[]
  choices: ModelChoice[]
  disabled: boolean
  onChange: (value: string | undefined) => void
}) {
  const { t } = useTranslation()
  const selectedChoice = choices.find((item) => item.value === value) ?? null

  return (
    <div className="max-w-62.5 min-w-0 justify-self-end self-center">
      <Menu modal>
        <MenuTrigger
          render={
            <Button
              disabled={disabled || choices.length === 0}
              id={id}
              variant="outline"
              className="w-full min-w-0 justify-between font-normal"
            />
          }
        >
          <span className={cn('min-w-0 truncate', !selectedChoice && 'text-muted-foreground')}>
            {selectedChoice
              ? `${selectedChoice.providerName} · ${selectedChoice.modelName}`
              : t('settings.defaultModel.notConfigured')}
          </span>
          <ChevronDown data-icon="inline-end" strokeWidth={1} />
        </MenuTrigger>
        <MenuContent align="end" glass>
          <MenuSearch placeholder={t('settings.defaultModel.search')} />
          <MenuList className="max-h-80">
            <MenuEmpty>{t('settings.defaultModel.empty')}</MenuEmpty>
            {providers.map((provider) =>
              provider.models.length > 0 ? (
                <MenuGroup heading={provider.name || provider.id} key={provider.id}>
                  {provider.models.map((model) => {
                    const qualifiedModel = `${provider.id}/${model.id}`
                    return (
                      <MenuItem
                        key={qualifiedModel}
                        selected={value === qualifiedModel}
                        value={`${provider.name} ${provider.id} ${model.displayName} ${model.id}`}
                        onSelect={() => onChange(qualifiedModel)}
                      >
                        <span className="truncate">{model.displayName || model.id}</span>
                      </MenuItem>
                    )
                  })}
                </MenuGroup>
              ) : null,
            )}
          </MenuList>
        </MenuContent>
      </Menu>
    </div>
  )
}

function FillAllModels({
  providers,
  choices,
  disabled,
  onSelect,
}: {
  providers: ModelProvider[]
  choices: ModelChoice[]
  disabled: boolean
  onSelect: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <Menu modal>
      <MenuTrigger
        render={
          <Button
            aria-label={t('settings.modelMapping.fillAllAria')}
            disabled={disabled || choices.length === 0}
            variant="outline"
          />
        }
      >
        <WandSparkles data-icon="inline-start" />
        {t('settings.modelMapping.fillAll')}
      </MenuTrigger>
      <MenuContent align="end" className="w-72" glass>
        <MenuSearch placeholder={t('settings.defaultModel.search')} />
        <MenuList>
          <MenuEmpty>{t('settings.defaultModel.empty')}</MenuEmpty>
          {providers.map((provider) =>
            provider.models.length > 0 ? (
              <MenuGroup heading={provider.name || provider.id} key={provider.id}>
                {provider.models.map((model) => {
                  const qualifiedModel = `${provider.id}/${model.id}`
                  return (
                    <MenuItem
                      key={qualifiedModel}
                      value={`${provider.name} ${provider.id} ${model.displayName} ${model.id}`}
                      onSelect={() => onSelect(qualifiedModel)}
                    >
                      <span className="truncate">{model.displayName || model.id}</span>
                    </MenuItem>
                  )
                })}
              </MenuGroup>
            ) : null,
          )}
        </MenuList>
      </MenuContent>
    </Menu>
  )
}

export function DefaultModelSettings({
  providers,
  model,
  modelMappings,
  onSave,
  onSaveMappings,
}: {
  providers: ModelProvider[]
  model: string | null
  modelMappings: ClaudeModelRoleMapping
  onSave: (model: string | null) => Promise<string | null>
  onSaveMappings: (mappings: ClaudeModelRoleMapping) => Promise<ClaudeModelRoleMapping>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<string | null>(model)
  const [mappingsDraft, setMappingsDraft] = useState<ClaudeModelRoleMapping>(modelMappings)
  const [isSaving, setIsSaving] = useState(false)
  const confirmed = useRef<string | null>(model)
  const confirmedMappings = useRef<ClaudeModelRoleMapping>(modelMappings)
  const choices = useMemo(() => modelChoices(providers), [providers])

  useEffect(() => {
    confirmed.current = model
    setDraft(model)
  }, [model])

  useEffect(() => {
    confirmedMappings.current = modelMappings
    setMappingsDraft(modelMappings)
  }, [modelMappings])

  async function persist(next: string | null) {
    setDraft(next)
    setIsSaving(true)
    try {
      const saved = await onSave(next)
      confirmed.current = saved
      setDraft(saved)
    } catch {
      setDraft(confirmed.current)
      toast.add({
        id: 'settings-default-model-save-error',
        title: t('common.toast.saveFailed'),
        description: t('settings.defaultModel.saveError'),
        type: 'error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  async function persistMappings(next: ClaudeModelRoleMapping) {
    setMappingsDraft(next)
    setIsSaving(true)
    try {
      const saved = await onSaveMappings(next)
      confirmedMappings.current = saved
      setMappingsDraft(saved)
    } catch {
      setMappingsDraft(confirmedMappings.current)
      toast.add({
        id: 'settings-model-mapping-save-error',
        title: t('common.toast.saveFailed'),
        description: t('settings.modelMapping.saveError'),
        type: 'error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  function updateMapping(role: ModelMappingRole, value: string | undefined) {
    const next = { ...mappingsDraft }
    if (value) next[role] = value
    else delete next[role]
    void persistMappings(next)
  }

  function fillAll(value: string) {
    void persistMappings(Object.fromEntries(MODEL_MAPPING_ROLES.map((role) => [role, value])))
  }

  return (
    <SettingsSection
      title={t('settings.modelMapping.title')}
      description={t('settings.modelMapping.description')}
      action={
        <>
          {isSaving ? <Spinner aria-label={t('settings.defaultModel.saving')} /> : null}
          <FillAllModels
            providers={providers}
            choices={choices}
            disabled={isSaving}
            onSelect={fillAll}
          />
        </>
      }
    >
      <SettingsList>
        <SettingsRow className="gap-3">
          <FieldContent className="min-w-0">
            <FieldLabel className="font-normal" htmlFor="settings-default-model">
              {t('settings.defaultModel.label')}
            </FieldLabel>
            <FieldDescription className="truncate">
              {t('settings.defaultModel.description')}
            </FieldDescription>
          </FieldContent>
          <ModelTargetPicker
            id="settings-default-model"
            value={draft ?? undefined}
            providers={providers}
            choices={choices}
            disabled={isSaving}
            onChange={(value) => void persist(value ?? null)}
          />
        </SettingsRow>
        {MODEL_MAPPING_ROLES.map((role) => {
          const pickerId = `settings-model-mapping-${role}`
          return (
            <SettingsRow className="gap-3" key={role}>
              <FieldContent className="min-w-0">
                <FieldLabel className="font-normal capitalize" htmlFor={pickerId}>
                  {role}
                </FieldLabel>
                <FieldDescription className="truncate">
                  {t(`settings.modelMapping.role.${role}.description` as never)}
                </FieldDescription>
              </FieldContent>
              <ModelTargetPicker
                id={pickerId}
                value={mappingsDraft[role]}
                providers={providers}
                choices={choices}
                disabled={isSaving}
                onChange={(value) => updateMapping(role, value)}
              />
            </SettingsRow>
          )
        })}
        {choices.length === 0 ? (
          <p className="px-4 py-4 text-xs text-muted-foreground">
            {t('settings.defaultModel.noModels')}
          </p>
        ) : null}
      </SettingsList>
    </SettingsSection>
  )
}
