import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { loadModelSettings } from '../../../services/claude/model-settings'
import { useClaudeRuntimeStore } from '../../../stores/claude-runtime-store'
import {
  useModelConfigurationStore,
  useModelConfigurationStoreApi,
} from '../../../stores/model-configuration-context'
import { getModelStartupPhase } from '../model-startup'
import { startModelProbe } from '../services/model-probe'

export function useModelStartup(isProjectCatalogLoaded: boolean, isSdkWaitBypassed: boolean) {
  const modelStore = useModelConfigurationStoreApi()
  const runtimeGeneration = useClaudeRuntimeStore((state) => state.generation)
  const {
    hasClaudeAuthentication,
    hasConfiguredClaudeModels,
    hasConfiguredProviders,
    isModelAccessResolved,
    isModelProbePending,
    isProviderSettingsLoaded,
    isSdkInitializationComplete,
  } = useModelConfigurationStore(
    useShallow((state) => ({
      hasClaudeAuthentication: state.hasClaudeAuthentication,
      hasConfiguredClaudeModels: state.hasConfiguredClaudeModels,
      hasConfiguredProviders: state.hasConfiguredProviders,
      isModelAccessResolved: state.isModelAccessResolved,
      isModelProbePending: state.isModelProbePending,
      isProviderSettingsLoaded: state.isSettingsLoaded,
      isSdkInitializationComplete: state.isSdkInitializationComplete,
    })),
  )
  const [isBootstrapSettled, setBootstrapSettled] = useState(false)
  const [failedGeneration, setFailedGeneration] = useState<number | null>(null)
  const [isModelOnboardingDismissed, setModelOnboardingDismissed] = useState(false)
  const [isOnboardingActive, setOnboardingActive] = useState(false)

  useEffect(() => {
    if (isSdkWaitBypassed) return

    let isCancelled = false
    const probe = startModelProbe(modelStore, undefined, runtimeGeneration)
    void probe.then(
      () => {},
      () => {
        if (!isCancelled) setFailedGeneration(runtimeGeneration)
      },
    )

    return () => {
      isCancelled = true
    }
  }, [isSdkWaitBypassed, modelStore, runtimeGeneration])

  useEffect(() => {
    if (isProviderSettingsLoaded) return

    let isCancelled = false
    void loadModelSettings(modelStore).catch(() => {
      if (!isCancelled) modelStore.getState().replaceSettings([], null)
    })

    return () => {
      isCancelled = true
    }
  }, [isProviderSettingsLoaded, modelStore])

  useEffect(() => {
    if (isBootstrapSettled || !isProjectCatalogLoaded || !isProviderSettingsLoaded) return

    const timeoutId = window.setTimeout(() => setBootstrapSettled(true), 0)
    return () => window.clearTimeout(timeoutId)
  }, [isBootstrapSettled, isProjectCatalogLoaded, isProviderSettingsLoaded])

  const phase = getModelStartupPhase({
    hasClaudeAuthentication,
    hasConfiguredClaudeModels,
    hasConfiguredProviders,
    hasModelProbeFailed: failedGeneration === runtimeGeneration,
    isModelAccessResolved,
    isModelProbePending,
    isProjectCatalogLoaded: isBootstrapSettled,
    isProviderSettingsLoaded,
    isSdkInitializationComplete,
    isSdkWaitBypassed,
  })

  useEffect(() => {
    if (phase === 'onboarding') setOnboardingActive(true)
  }, [phase])

  const dismissModelOnboarding = useCallback(() => {
    setModelOnboardingDismissed(true)
  }, [])

  return {
    dismissModelOnboarding,
    completeOnboarding: dismissModelOnboarding,
    initialStep: 1 as const,
    shouldShowModelOnboarding:
      (phase === 'onboarding' || isOnboardingActive) && !isModelOnboardingDismissed,
    phase,
  }
}
