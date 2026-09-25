import { ChevronDown, WandSparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Card, CardContent } from '@/shadcn/card'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/shadcn/field'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import { cn } from '@/shadcn/utils'

import type { ClaudeModelMappings, ModelProvider } from '../../services/claude/claude'
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

type ModelMappingRole = keyof ClaudeModelMappings

interface ModelMappingRoleOption {
  role: ModelMappingRole
  labelKey: string
  descriptionKey: string
}

const MODEL_MAPPING_ROLES: ModelMappingRoleOption[] = [
  {
    role: 'sonnet',
    labelKey: 'Sonnet',
    descriptionKey: 'settings.modelMapping.role.sonnet.description',
  },
  {
    role: 'opus',
    labelKey: 'Opus',
    descriptionKey: 'settings.modelMapping.role.opus.description',
  },
  {
    role: 'fable',
    labelKey: 'Fable',
    descriptionKey: 'settings.modelMapping.role.fable.description',
  },
  {
    role: 'haiku',
    labelKey: 'Haiku',
    descriptionKey: 'settings.modelMapping.role.haiku.description',
  },
  {
    role: 'subagent',
    labelKey: 'Subagent',
    descriptionKey: 'settings.modelMapping.role.subagent.description',
  },
  {
    role: 'fallback',
    labelKey: 'settings.modelMapping.fallback',
    descriptionKey: 'settings.modelMapping.fallbackDescription',
  },
]

interface ModelChoice {
  value: string
  providerName: string
  modelName: string
}

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
    <div className="w-full max-w-62.5 min-w-0 justify-self-end">
      <Menu modal>
        <MenuTrigger
          render={
            <Button
              disabled={disabled || choices.length === 0}
              id={id}
              variant="outline"
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className={cn('truncate', !selectedChoice && 'text-muted-foreground')}>
            {selectedChoice
              ? `${selectedChoice.providerName} · ${selectedChoice.modelName}`
              : t('settings.modelMapping.notConfigured')}
          </span>
          {selectedChoice ? (
            <span
              className="hidden size-5 shrink-0 items-center justify-center rounded-full transition-colors group-hover/button:flex hover:bg-foreground/6"
              data-icon="inline-end"
              data-slot="mapping-clear"
              onClick={(event) => {
                event.stopPropagation()
                onChange(undefined)
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <X className="size-3.5" strokeWidth={1} />
            </span>
          ) : null}
          <ChevronDown
            className={selectedChoice ? 'group-hover/button:hidden' : undefined}
            data-icon="inline-end"
            strokeWidth={1}
          />
        </MenuTrigger>
        <MenuContent align="end" glass>
          <MenuSearch placeholder={t('settings.modelMapping.search')} />
          <MenuList className="max-h-80">
            <MenuEmpty>{t('settings.modelMapping.empty')}</MenuEmpty>
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
        <MenuSearch placeholder={t('settings.modelMapping.search')} />
        <MenuList>
          <MenuEmpty>{t('settings.modelMapping.empty')}</MenuEmpty>
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

export function ModelMappingSettings({
  providers,
  models,
  onSave,
}: {
  providers: ModelProvider[]
  models: ClaudeModelMappings
  onSave: (models: ClaudeModelMappings) => Promise<ClaudeModelMappings>
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ClaudeModelMappings>(models)
  const [isSaving, setIsSaving] = useState(false)
  const confirmed = useRef<ClaudeModelMappings>(models)
  const choices = useMemo(() => modelChoices(providers), [providers])

  useEffect(() => {
    confirmed.current = models
    setDraft(models)
  }, [models])

  function updateModel(role: ModelMappingRole, value: string | undefined) {
    const next = { ...draft }
    if (value) next[role] = value
    else delete next[role]
    void persist(next)
  }

  function fillAll(value: string) {
    const next = Object.fromEntries(
      MODEL_MAPPING_ROLES.map(({ role }) => [role, value]),
    ) as ClaudeModelMappings
    void persist(next)
  }

  async function persist(next: ClaudeModelMappings) {
    setDraft(next)
    setIsSaving(true)
    try {
      const saved = await onSave(next)
      confirmed.current = saved
      setDraft(saved)
    } catch {
      setDraft(confirmed.current)
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

  return (
    <SettingsSection
      title={t('settings.modelMapping.title')}
      action={
        <>
          {isSaving ? <Spinner aria-label={t('settings.modelMapping.saving')} /> : null}
          <FillAllModels
            providers={providers}
            choices={choices}
            disabled={isSaving}
            onSelect={fillAll}
          />
        </>
      }
    >
      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          <FieldGroup className="gap-0">
            {MODEL_MAPPING_ROLES.map(({ role, labelKey, descriptionKey }) => {
              const pickerId = `settings-model-mapping-${role}`

              return (
                <Field
                  className="grid min-h-16 items-center gap-3 border-b px-6 py-4 last:border-b-0 md:grid-cols-[minmax(120px,1fr)_250px]"
                  key={role}
                >
                  <FieldContent className="min-w-0">
                    <FieldLabel className="font-normal" htmlFor={pickerId}>
                      {t(labelKey as never)}
                    </FieldLabel>
                    <FieldDescription className="truncate">
                      {t(descriptionKey as never)}
                    </FieldDescription>
                  </FieldContent>
                  <ModelTargetPicker
                    id={pickerId}
                    value={draft[role]}
                    providers={providers}
                    choices={choices}
                    disabled={isSaving}
                    onChange={(value) => updateModel(role, value)}
                  />
                </Field>
              )
            })}
          </FieldGroup>
          {choices.length === 0 ? (
            <p className="border-t px-6 py-4 text-xs text-muted-foreground">
              {t('settings.modelMapping.noModels')}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </SettingsSection>
  )
}
