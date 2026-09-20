import { Library, Plus, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shadcn/field'
import { Input } from '@/shadcn/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/select'
import { Separator } from '@/shadcn/separator'
import { Spinner } from '@/shadcn/spinner'
import { Switch } from '@/shadcn/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { normalizeProviderApiType } from '@/shared/provider'
import { GENERIC_REASONING_PRESET, findReasoningPreset } from '@/shared/reasoning'

import type { ModelProvider, ProviderModel } from '../../services/claude/claude'
import { ContextWindowInput } from './context-window-input'
import { type ProviderPreset, providerPresets } from './provider-presets'

function ProviderField({
  id,
  label,
  hint,
  children,
}: {
  id: string
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <Field>
      <FieldLabel className="font-normal text-foreground" htmlFor={id}>
        {label}
      </FieldLabel>
      {children}
      {hint ? <FieldDescription className="text-foreground-subtle">{hint}</FieldDescription> : null}
    </Field>
  )
}

const LEVEL_LABEL_KEYS = {
  off: 'settings.provider.reasoning.off',
  on: 'settings.provider.reasoning.on',
  low: 'settings.provider.reasoning.low',
  medium: 'settings.provider.reasoning.medium',
  high: 'settings.provider.reasoning.high',
  xhigh: 'settings.provider.reasoning.xhigh',
  max: 'settings.provider.reasoning.max',
} as const

/** Reasoning dropdown fed by the model's linked reasoning preset. */
function ThinkingLevelSelect({
  model,
  label,
  onChange,
}: {
  model: ProviderModel
  label: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const preset = model.thinkingPresetId ? findReasoningPreset(model.thinkingPresetId) : undefined
  const mappings = (preset ?? GENERIC_REASONING_PRESET).mappings
  const defaultLevel = (preset ?? GENERIC_REASONING_PRESET).defaultModelLevel
  const items = mappings.map((row) => ({
    value: row.modelLevel,
    label: t(LEVEL_LABEL_KEYS[row.modelLevel as keyof typeof LEVEL_LABEL_KEYS]),
  }))
  const current = mappings.some((row) => row.modelLevel === model.thinkingLevel)
    ? model.thinkingLevel!
    : defaultLevel

  return (
    <Select items={items} value={current} onValueChange={(value) => onChange(String(value))}>
      <SelectTrigger
        aria-label={label}
        chevron={false}
        className="w-full border-transparent bg-transparent!"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent glass alignItemWithTrigger={false} align="end">
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

const API_TYPE_ITEMS = [
  { value: 'anthropic-messages', labelKey: 'settings.provider.apiType.anthropicMessages' },
  { value: 'chat-completions', labelKey: 'settings.provider.apiType.chatCompletions' },
] as const

export function ProviderEditorForm({
  provider,
  providerIdError,
  modelIdErrorIndexes,
  isProviderIdReadOnly,
  onChange,
  onAddModel,
  onUpdateModel,
  onRemoveModel,
  onFetchModels,
  onPreset,
  isFetchingModels,
}: {
  provider: ModelProvider
  providerIdError: string | null
  modelIdErrorIndexes: number[]
  isProviderIdReadOnly: boolean
  onChange: (patch: Partial<ModelProvider>) => void
  onAddModel: () => void
  onUpdateModel: (index: number, patch: Partial<ProviderModel>) => void
  onRemoveModel: (index: number) => void
  onFetchModels: () => void
  onPreset?: (preset: ProviderPreset) => void
  isFetchingModels: boolean
}) {
  const { t } = useTranslation()
  const suffix = provider.id || 'new'
  const apiType = normalizeProviderApiType(provider.apiType)

  return (
    <FieldGroup className="gap-5 px-6 py-4">
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <Field data-invalid={Boolean(providerIdError)}>
          <FieldLabel className="font-normal text-foreground" htmlFor={`provider-${suffix}-id`}>
            {t('settings.provider.idLabel')}
          </FieldLabel>
          {isProviderIdReadOnly ? (
            <Input id={`provider-${suffix}-id`} readOnly value={provider.id} />
          ) : (
            <>
              <Input
                id={`provider-${suffix}-id`}
                aria-invalid={Boolean(providerIdError)}
                list={`provider-${suffix}-presets`}
                placeholder="zhipu-glm"
                spellCheck={false}
                value={provider.id}
                onChange={(event) => {
                  const id = event.target.value
                  onChange({ id })
                  const preset = providerPresets.find((item) => item.id === id)
                  if (preset) onPreset?.(preset)
                }}
              />
              <datalist id={`provider-${suffix}-presets`}>
                {providerPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </datalist>
            </>
          )}
          {providerIdError ? <FieldError>{providerIdError}</FieldError> : null}
        </Field>
        <ProviderField id={`provider-${suffix}-name`} label={t('settings.provider.name')}>
          <Input
            id={`provider-${suffix}-name`}
            value={provider.name}
            placeholder="DeepSeek"
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </ProviderField>
        <div className="md:col-span-2">
          <ProviderField id={`provider-${suffix}-base`} label={t('settings.provider.baseUrl')}>
            <Input
              id={`provider-${suffix}-base`}
              value={provider.baseURL}
              placeholder="https://api.deepseek.com/anthropic"
              onChange={(event) => onChange({ baseURL: event.target.value })}
            />
          </ProviderField>
        </div>
        <ProviderField
          id={`provider-${suffix}-api-type`}
          hint={apiType === 'chat-completions' ? t('settings.provider.apiTypeHint') : undefined}
          label={t('settings.provider.apiType')}
        >
          <Select
            items={API_TYPE_ITEMS.map((item) => ({ ...item, label: t(item.labelKey) }))}
            value={apiType}
            onValueChange={(value) => onChange({ apiType: normalizeProviderApiType(value) })}
          >
            <SelectTrigger id={`provider-${suffix}-api-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {API_TYPE_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </ProviderField>
        <ProviderField id={`provider-${suffix}-token`} label={t('settings.provider.credential')}>
          <Input
            id={`provider-${suffix}-token`}
            type="password"
            value={provider.authToken}
            placeholder="sk-***"
            onChange={(event) => onChange({ authToken: event.target.value })}
          />
        </ProviderField>
      </FieldGroup>

      <Separator />

      <FieldSet>
        <FieldLegend className="sr-only">{t('settings.provider.models')}</FieldLegend>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-normal text-foreground">{t('settings.provider.models')}</div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('settings.provider.addModel')}
                    size="icon"
                    variant="mute"
                    onClick={onAddModel}
                  />
                }
              >
                <Plus />
              </TooltipTrigger>
              <TooltipContent>{t('settings.provider.addModel')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('settings.provider.fetchModels')}
                    disabled={isFetchingModels || !provider.baseURL || !provider.authToken}
                    size="icon"
                    variant="mute"
                    onClick={onFetchModels}
                  />
                }
              >
                {isFetchingModels ? <Spinner /> : <Library />}
              </TooltipTrigger>
              <TooltipContent>{t('settings.provider.fetchModels')}</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="hidden gap-2 border-b border-border bg-muted/40 px-3 py-1.5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_110px_50px_50px]">
            <div className="px-2 text-xs whitespace-nowrap text-muted-foreground">
              {t('settings.provider.modelColumnId')}
            </div>
            <div className="px-2 text-xs whitespace-nowrap text-muted-foreground">
              {t('settings.provider.modelColumnName')}
            </div>
            <div className="px-2 text-xs whitespace-nowrap text-muted-foreground">
              {t('settings.provider.modelColumnContext')}
            </div>
            <div className="px-2 text-xs whitespace-nowrap text-muted-foreground">
              {t('settings.provider.modelColumnReasoning')}
            </div>
            <div className="text-center text-xs whitespace-nowrap text-muted-foreground">
              {t('settings.provider.modelColumnVision')}
            </div>
            <div className="text-center text-xs whitespace-nowrap text-muted-foreground">
              {t('settings.provider.modelColumnActions')}
            </div>
          </div>
          {provider.models.length ? (
            <div className="divide-y divide-border/60">
              {provider.models.map((model, index) => {
                const hasModelIdError = modelIdErrorIndexes.includes(index)
                return (
                  <div
                    className="grid items-center gap-2 px-3 py-1 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px_110px_50px_50px]"
                    key={index}
                  >
                    <Field className="gap-1" data-invalid={hasModelIdError}>
                      <Input
                        aria-invalid={hasModelIdError}
                        aria-label={t('settings.provider.modelId', { number: index + 1 })}
                        className="border-transparent bg-transparent!"
                        spellCheck={false}
                        value={model.id}
                        placeholder={t('settings.provider.modelIdPlaceholder')}
                        onChange={(event) => onUpdateModel(index, { id: event.target.value })}
                      />
                      {hasModelIdError ? (
                        <FieldError>{t('settings.provider.modelIdRequired')}</FieldError>
                      ) : null}
                    </Field>
                    <Input
                      aria-label={t('settings.provider.modelDisplayName', { number: index + 1 })}
                      className="border-transparent bg-transparent!"
                      value={model.displayName}
                      placeholder={t('settings.provider.modelNamePlaceholder')}
                      onChange={(event) =>
                        onUpdateModel(index, { displayName: event.target.value })
                      }
                    />
                    <ContextWindowInput
                      className="border-transparent bg-transparent!"
                      label={t('settings.provider.modelContext', { number: index + 1 })}
                      value={model.contextWindow}
                      onChange={(contextWindow) => onUpdateModel(index, { contextWindow })}
                    />
                    <ThinkingLevelSelect
                      model={model}
                      label={t('settings.provider.modelReasoning', { number: index + 1 })}
                      onChange={(thinkingLevel) => onUpdateModel(index, { thinkingLevel })}
                    />
                    <div className="flex items-center gap-2 md:justify-self-center">
                      <Switch
                        aria-label={t('settings.provider.modelMultimodalAria', {
                          number: index + 1,
                        })}
                        checked={model.supportsMultimodal !== false}
                        onCheckedChange={(supportsMultimodal) =>
                          onUpdateModel(index, { supportsMultimodal })
                        }
                      />
                      <span className="text-xs text-foreground-subtle md:hidden">
                        {t('settings.provider.modelMultimodal')}
                      </span>
                    </div>
                    <Button
                      aria-label={t('settings.provider.deleteModel', { number: index + 1 })}
                      className="justify-self-center"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => onRemoveModel(index)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              {t('settings.provider.modelsEmpty')}
            </div>
          )}
        </div>
      </FieldSet>
    </FieldGroup>
  )
}
