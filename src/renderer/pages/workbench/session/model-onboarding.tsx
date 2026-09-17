import { Check } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/shadcn/button'
import { Card } from '@/shadcn/card'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import { cn } from '@/shadcn/utils'
import { CLAUDE_MODEL_MAPPING_ROLES, PROVIDER_ID_PATTERN } from '@/shared/provider'

import { ModelMappingSettings } from '../../../components/model-configuration/model-mapping-settings'
import {
  createProviderDraft,
  getInvalidModelIndexes,
  providerFromPreset,
  upsertProvider,
} from '../../../components/model-configuration/provider-draft'
import { ProviderEditorForm } from '../../../components/model-configuration/provider-editor-form'
import { providerPresets } from '../../../components/model-configuration/provider-presets'
import { useProviderDraft } from '../../../components/model-configuration/use-provider-draft'
import type { ClaudeModelMappings, ModelProvider } from '../../../services/claude/claude'
import { claude } from '../../../services/claude/claude'
import { useModelConfigurationStore } from '../../../stores/model-configuration-context'

const DEFAULT_PRESET =
  providerPresets.find((preset) => preset.id === 'zhipu-glm') ?? providerPresets[0]

function initialProvider(): ModelProvider {
  return DEFAULT_PRESET ? providerFromPreset(DEFAULT_PRESET) : createProviderDraft()
}

function Stepper({ step }: { step: 1 | 2 }) {
  const { t } = useTranslation()
  const steps = [
    t('workbench.onboarding.stepProvider'),
    t('workbench.onboarding.stepModels'),
    t('workbench.onboarding.stepChat'),
  ]

  return (
    <div className="mx-auto grid w-full max-w-3xl grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-4 px-6">
      {steps.map((label, index) => {
        const number = index + 1
        const isComplete = number < step
        const isActive = number === step
        return (
          <div className="contents" key={label}>
            {index > 0 ? <div className="h-px bg-border" /> : null}
            <div
              className={cn(
                'flex items-center gap-2 text-sm text-foreground-subtlest',
                (isActive || isComplete) && 'text-foreground',
              )}
            >
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border border-border bg-background text-xs',
                  isActive && 'border-primary bg-primary text-primary-foreground',
                  isComplete && 'border-foreground bg-foreground text-background',
                )}
              >
                {isComplete ? <Check className="size-3.5" /> : number}
              </div>
              <span className="font-medium whitespace-nowrap">{label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ModelOnboarding({
  onComplete,
  onSkip,
}: {
  onComplete: () => void | Promise<void>
  onSkip: () => void
}) {
  const { t } = useTranslation()
  const { modelMappings, providers, replaceSettings } = useModelConfigurationStore(
    useShallow((state) => ({
      modelMappings: state.modelMappings,
      providers: state.providers,
      replaceSettings: state.replaceSettings,
    })),
  )
  const [step, setStep] = useState<1 | 2>(1)
  const [savedProvider, setSavedProvider] = useState<ModelProvider | null>(null)
  const [mappings, setMappings] = useState<ClaudeModelMappings>({})
  const [isSaving, setSaving] = useState(false)
  const [isMappingSaving, setMappingSaving] = useState(false)
  const [isCompleting, setCompleting] = useState(false)
  const pendingMappingSaveRef = useRef<Promise<ClaudeModelMappings> | null>(null)
  const draft = useProviderDraft({
    initial: initialProvider,
    fetchErrorToast: {
      title: t('common.toast.fetchFailed'),
      description: t('workbench.onboarding.fetchError'),
    },
  })

  const mappingProviders = useMemo(() => (savedProvider ? [savedProvider] : []), [savedProvider])

  async function handleNext() {
    const provider = { ...draft.provider, id: draft.provider.id.trim() }
    draft.patchProvider({ id: provider.id })
    if (!provider.id) {
      draft.setProviderIdError(t('settings.provider.idRequired'))
      return
    }
    if (provider.id === 'claude') {
      draft.setProviderIdError(t('workbench.onboarding.providerReserved'))
      return
    }
    if (!PROVIDER_ID_PATTERN.test(provider.id)) {
      draft.setProviderIdError(t('settings.provider.idFormat'))
      return
    }
    if (!provider.baseURL.trim() || !provider.authToken.trim()) {
      toast.add({ title: t('workbench.onboarding.missingCredentials'), type: 'error' })
      return
    }
    const invalidModels = getInvalidModelIndexes(provider.models)
    if (invalidModels.length || !provider.models.length) {
      draft.setModelIdErrorIndexes(invalidModels)
      toast.add({ title: t('workbench.onboarding.modelRequired'), type: 'error' })
      return
    }

    setSaving(true)
    try {
      const saved = savedProvider
        ? await claude.updateProvider(provider)
        : await claude.createProvider(provider)
      setSavedProvider(saved)
      const nextProviders = upsertProvider(providers, saved)
      replaceSettings(nextProviders, modelMappings)
      const defaultModel = `${saved.id}/${saved.models[0].id}`
      const defaults = Object.fromEntries(
        CLAUDE_MODEL_MAPPING_ROLES.map((role) => [role, defaultModel]),
      ) as ClaudeModelMappings
      const savedMappings = await claude.saveModelMappings(defaults)
      setMappings(savedMappings)
      replaceSettings(nextProviders, savedMappings)
      setStep(2)
    } catch (caught) {
      toast.add({
        title: caught instanceof Error ? caught.message : t('settings.provider.saveError'),
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  async function saveMappings(next: ClaudeModelMappings) {
    setMappingSaving(true)
    const save = claude.saveModelMappings(next).then((saved) => {
      setMappings(saved)
      if (savedProvider) replaceSettings(upsertProvider(providers, savedProvider), saved)
      return saved
    })
    pendingMappingSaveRef.current = save
    try {
      return await save
    } finally {
      if (pendingMappingSaveRef.current === save) {
        pendingMappingSaveRef.current = null
        setMappingSaving(false)
      }
    }
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      await pendingMappingSaveRef.current
      if (!savedProvider) return
      await onComplete()
    } catch {
      // ModelMappingSettings owns the save error toast and restores its confirmed value.
    } finally {
      setCompleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background text-foreground">
      <div className="app-region-drag h-11 shrink-0" />
      <div className="shrink-0 pt-5 pb-6">
        <Stepper step={step} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-5xl px-8 pt-8 pb-12">
          {step === 1 ? (
            <section className="flex flex-col gap-4">
              <div>
                <h1 className="text-lg font-semibold">{t('workbench.onboarding.title')}</h1>
                <p className="mt-1 text-sm text-foreground-subtle">
                  {t('workbench.onboarding.description')}
                </p>
              </div>
              <Card className="gap-0 py-0">
                <ProviderEditorForm
                  isFetchingModels={draft.isFetchingModels}
                  modelIdErrorIndexes={draft.modelIdErrorIndexes}
                  provider={draft.provider}
                  providerIdError={draft.providerIdError}
                  isProviderIdReadOnly={Boolean(savedProvider)}
                  onAddModel={draft.addModel}
                  onChange={draft.patchProvider}
                  onFetchModels={() => void draft.fetchModels()}
                  onPreset={draft.applyPreset}
                  onRemoveModel={draft.removeModel}
                  onUpdateModel={draft.updateModel}
                />
              </Card>
            </section>
          ) : (
            <ModelMappingSettings
              models={mappings}
              providers={mappingProviders}
              onSave={saveMappings}
            />
          )}
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 px-8 py-5">
        {step === 1 ? (
          <>
            <Button disabled={isSaving} variant="ghost" onClick={onSkip}>
              {t('workbench.onboarding.skip')}
            </Button>
            <Button disabled={isSaving} onClick={() => void handleNext()}>
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              {t('workbench.onboarding.next')}
            </Button>
          </>
        ) : (
          <>
            <Button
              disabled={isCompleting || isMappingSaving}
              variant="ghost"
              onClick={() => setStep(1)}
            >
              {t('workbench.onboarding.back')}
            </Button>
            <Button
              disabled={isCompleting || isMappingSaving}
              onClick={() => void handleComplete()}
            >
              {isCompleting ? <Spinner data-icon="inline-start" /> : null}
              {t('workbench.onboarding.finish')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
