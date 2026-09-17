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
import { RadioGroup, RadioGroupItem } from '@/shadcn/radio-group'
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
import {
  PROVIDER_MODEL_REASONING_LEVELS,
  type ProviderModelReasoning,
  normalizeProviderModelReasoning,
} from '@/shared/provider'

import type { ModelProvider, ProviderAuthField, ProviderModel } from '../../services/claude/claude'
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
  const reasoningItems = PROVIDER_MODEL_REASONING_LEVELS.map((value) => ({
    label: t(`settings.provider.reasoning.${value}`),
    value,
  }))

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
          <ProviderField id={`provider-${suffix}-base`} label={t('settings.provider.requestUrl')}>
            <Input
              id={`provider-${suffix}-base`}
              value={provider.baseURL}
              placeholder="https://api.deepseek.com/anthropic"
              onChange={(event) => onChange({ baseURL: event.target.value })}
            />
          </ProviderField>
        </div>
        <ProviderField id={`provider-${suffix}-token`} label={t('settings.provider.credential')}>
          <Input
            id={`provider-${suffix}-token`}
            type="password"
            value={provider.authToken}
            placeholder="sk-***"
            onChange={(event) => onChange({ authToken: event.target.value })}
          />
        </ProviderField>
        <ProviderField id={`provider-${suffix}-auth`} label={t('settings.provider.authField')}>
          <RadioGroup
            aria-label={t('settings.provider.authField')}
            className="grid-cols-2"
            value={provider.authField}
            onValueChange={(value) => onChange({ authField: value as ProviderAuthField })}
          >
            <Field orientation="horizontal">
              <RadioGroupItem id={`provider-${suffix}-token-field`} value="ANTHROPIC_AUTH_TOKEN" />
              <FieldLabel
                className="font-normal text-foreground"
                htmlFor={`provider-${suffix}-token-field`}
              >
                AUTH_TOKEN
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <RadioGroupItem id={`provider-${suffix}-apikey-field`} value="ANTHROPIC_API_KEY" />
              <FieldLabel
                className="font-normal text-foreground"
                htmlFor={`provider-${suffix}-apikey-field`}
              >
                API_KEY
              </FieldLabel>
            </Field>
          </RadioGroup>
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
          <div className="hidden gap-2 border-b border-border bg-muted/40 px-3 py-1.5 md:grid md:grid-cols-[1fr_1fr_100px_80px_50px_50px]">
            <div className="px-2 text-xs text-muted-foreground">
              {t('settings.provider.modelColumnId')}
            </div>
            <div className="px-2 text-xs text-muted-foreground">
              {t('settings.provider.modelColumnName')}
            </div>
            <div className="px-2 text-xs text-muted-foreground">
              {t('settings.provider.modelColumnContext')}
            </div>
            <div className="px-2 text-xs text-muted-foreground">
              {t('settings.provider.modelColumnReasoning')}
            </div>
            <div className="text-center text-xs text-muted-foreground">
              {t('settings.provider.modelColumnVision')}
            </div>
            <div className="text-center text-xs text-muted-foreground">
              {t('settings.provider.modelColumnActions')}
            </div>
          </div>
          {provider.models.length ? (
            <div className="divide-y divide-border/60">
              {provider.models.map((model, index) => {
                const hasModelIdError = modelIdErrorIndexes.includes(index)
                return (
                  <div
                    className="grid items-center gap-2 px-3 py-1 hover:bg-muted/30 md:grid-cols-[1fr_1fr_100px_80px_50px_50px]"
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
                    <Select
                      items={reasoningItems}
                      value={normalizeProviderModelReasoning(model.reasoning)}
                      onValueChange={(reasoning) =>
                        onUpdateModel(index, { reasoning: reasoning as ProviderModelReasoning })
                      }
                    >
                      <SelectTrigger
                        aria-label={t('settings.provider.modelReasoning', { number: index + 1 })}
                        chevron={false}
                        className="w-full border-transparent bg-transparent!"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent glass alignItemWithTrigger={false} align="end">
                        <SelectGroup>
                          {reasoningItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
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
