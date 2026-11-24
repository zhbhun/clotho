import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/shadcn/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import { PROVIDER_ID_PATTERN } from '@/shared/provider'

import { ClaudeRuntimePanel } from '../../../components/claude-runtime'
import { DefaultModelSettings } from '../../../components/model-configuration/default-model-settings'
import {
  createProviderDraft,
  getInvalidModelIndexes,
  providerFromPreset,
  upsertProvider,
} from '../../../components/model-configuration/provider-draft'
import { ProviderEditorForm } from '../../../components/model-configuration/provider-editor-form'
import { providerPresets } from '../../../components/model-configuration/provider-presets'
import { useProviderDraft } from '../../../components/model-configuration/use-provider-draft'
import { loadModelMappings, saveModelMappings } from '../../../services/app-settings'
import type { ModelProvider } from '../../../services/claude/claude'
import { claude } from '../../../services/claude/claude'
import { useModelConfigurationStore } from '../../../stores/model-configuration-context'
import { OnboardingLayout } from '../components/onboarding-layout'
import { type OnboardingStep, OnboardingSteps } from '../components/onboarding-steps'

const DEFAULT_PRESET =
  providerPresets.find((preset) => preset.id === 'zhipu-glm') ?? providerPresets[0]

function initialProvider(): ModelProvider {
  return DEFAULT_PRESET ? providerFromPreset(DEFAULT_PRESET) : createProviderDraft()
}

export function ModelOnboarding({
  onComplete,
  onSkip,
  initialStep = 1,
}: {
  onComplete: () => void | Promise<void>
  onSkip: () => void
  initialStep?: 1 | 2
}) {
  const { t } = useTranslation()
  const {
    defaultModel: savedDefaultModel,
    providers,
    replaceSettings,
    hasClaudeAuthentication,
    claudeModels,
  } = useModelConfigurationStore(
    useShallow((state) => ({
      defaultModel: state.defaultModel,
      providers: state.providers,
      replaceSettings: state.replaceSettings,
      hasClaudeAuthentication: state.hasClaudeAuthentication,
      claudeModels: state.claudeModels,
    })),
  )
  const [step, setStep] = useState<OnboardingStep>(initialStep)
  const [completedStep, setCompletedStep] = useState(
    initialStep === 2 && (savedDefaultModel || hasClaudeAuthentication) ? 2 : initialStep - 1,
  )
  const [savedProvider, setSavedProvider] = useState<ModelProvider | null>(
    () =>
      providers.find((provider) => savedDefaultModel?.startsWith(provider.id + '/')) ??
      providers[0] ??
      null,
  )
  const [defaultModel, setDefaultModel] = useState<string | null>(savedDefaultModel)
  const [isSaving, setSaving] = useState(false)
  const [isModelSaving, setModelSaving] = useState(false)
  const [isCompleting, setCompleting] = useState(false)
  const pendingModelSaveRef = useRef<Promise<unknown> | null>(null)
  const draft = useProviderDraft({
    initial: () => savedProvider ?? initialProvider(),
    fetchErrorToast: {
      title: t('common.toast.fetchFailed'),
      description: t('workbench.onboarding.fetchError'),
    },
  })

  const mappingProviders = useMemo(
    () => (savedProvider ? upsertProvider(providers, savedProvider) : providers),
    [providers, savedProvider],
  )
  const isNative = hasClaudeAuthentication && !savedProvider
  const canComplete =
    isNative ||
    mappingProviders.some((provider) =>
      provider.models.some((model) => `${provider.id}/${model.id}` === defaultModel),
    )

  async function handleNext() {
    if (isNative) {
      setCompletedStep((current) => Math.max(current, 1))
      setStep(2)
      return
    }
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
      const saved = providers.some((existing) => existing.id === provider.id)
        ? await claude.updateProvider(provider)
        : await claude.createProvider(provider)
      setSavedProvider(saved)
      const nextProviders = upsertProvider(providers, saved)
      replaceSettings(nextProviders, savedDefaultModel)
      const nextDefaultModel = saved.models.some(
        (model) => `${saved.id}/${model.id}` === defaultModel,
      )
        ? defaultModel!
        : `${saved.id}/${saved.models[0].id}`
      const savedDefault = await claude.saveDefaultModel(nextDefaultModel)
      setDefaultModel(savedDefault)
      replaceSettings(nextProviders, savedDefault)
      setCompletedStep(2)
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

  async function trackModelSave<T>(save: Promise<T>) {
    setModelSaving(true)
    pendingModelSaveRef.current = save
    try {
      return await save
    } finally {
      if (pendingModelSaveRef.current === save) {
        pendingModelSaveRef.current = null
        setModelSaving(false)
      }
    }
  }

  function saveDefaultModel(next: string | null) {
    return trackModelSave(
      claude.saveDefaultModel(next).then((saved) => {
        setDefaultModel(saved)
        if (savedProvider) replaceSettings(upsertProvider(providers, savedProvider), saved)
        return saved
      }),
    )
  }

  async function handleComplete() {
    setCompleting(true)
    try {
      await pendingModelSaveRef.current
      if (!canComplete) return
      await onComplete()
    } catch (caught) {
      toast.add({
        title: caught instanceof Error ? caught.message : t('settings.provider.saveError'),
        type: 'error',
      })
    } finally {
      setCompleting(false)
    }
  }

  return (
    <OnboardingLayout
      steps={
        <OnboardingSteps
          step={step}
          completedStep={completedStep}
          disabled={isSaving || isModelSaving || isCompleting}
          onStepChange={setStep}
        />
      }
    >
      {step === 0 ? (
        <ClaudeRuntimePanel onContinue={() => setStep(1)} />
      ) : step === 1 ? (
        <section className="flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-semibold">{t('workbench.onboarding.title')}</h1>
            <p className="mt-1 text-sm text-foreground-subtle">
              {t('workbench.onboarding.description')}
            </p>
          </div>
          {isNative ? (
            <Card>
              <CardHeader>
                <CardTitle>Claude</CardTitle>
                <CardDescription>{t('workbench.onboarding.claudeConnected')}</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card className="gap-0 py-0">
              <ProviderEditorForm
                isFetchingModels={draft.isFetchingModels}
                modelIdErrorIndexes={draft.modelIdErrorIndexes}
                provider={draft.provider}
                providerIdError={draft.providerIdError}
                isProviderIdReadOnly={false}
                onAddModel={draft.addModel}
                onChange={draft.patchProvider}
                onFetchModels={() => void draft.fetchModels()}
                onPreset={draft.applyPreset}
                onRemoveModel={draft.removeModel}
                onUpdateModel={draft.updateModel}
              />
            </Card>
          )}
        </section>
      ) : isNative ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('workbench.onboarding.stepModels')}</CardTitle>
            <CardDescription>{t('workbench.onboarding.claudeDefault')}</CardDescription>
            <p className="text-sm text-foreground-subtle">
              {claudeModels.map((model) => model.displayName).join(' · ')}
            </p>
          </CardHeader>
        </Card>
      ) : (
        <DefaultModelSettings
          model={defaultModel}
          modelMappings={loadModelMappings()}
          providers={mappingProviders}
          onSave={saveDefaultModel}
          onSaveMappings={(mappings) =>
            trackModelSave(saveModelMappings(mappings).then(() => loadModelMappings()))
          }
        />
      )}
      {step !== 0 ? (
        <div className="mt-6 flex flex-wrap justify-end gap-2">
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
                disabled={isCompleting || isModelSaving}
                variant="ghost"
                onClick={() => setStep(1)}
              >
                {t('workbench.onboarding.back')}
              </Button>
              <Button
                disabled={isCompleting || isModelSaving || !canComplete}
                onClick={() => void handleComplete()}
              >
                {isCompleting ? <Spinner data-icon="inline-start" /> : null}
                {t('workbench.onboarding.finish')}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </OnboardingLayout>
  )
}
