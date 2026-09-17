import { useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { loadModelSettings } from '../../../services/claude/model-settings'
import {
  useModelConfigurationStore,
  useModelConfigurationStoreApi,
} from '../../../stores/model-configuration-context'
import { type ModelStartupDestination, getModelStartupPhase } from '../model-startup'
import { startModelProbe } from '../services/model-probe'

const SDK_STARTUP_WAIT_MS = 1_000

export function useModelStartup(isProjectCatalogLoaded: boolean, isSdkWaitBypassed: boolean) {
  const modelStore = useModelConfigurationStoreApi()
  const {
    hasClaudeAuthentication,
    hasConfiguredProviders,
    isModelAccessResolved,
    isProviderSettingsLoaded,
    isSdkInitializationComplete,
  } = useModelConfigurationStore(
    useShallow((state) => ({
      hasClaudeAuthentication: state.hasClaudeAuthentication,
      hasConfiguredProviders: state.hasConfiguredProviders,
      isModelAccessResolved: state.isModelAccessResolved,
      isProviderSettingsLoaded: state.isSettingsLoaded,
      isSdkInitializationComplete: state.isSdkInitializationComplete,
    })),
  )
  const [isBootstrapSettled, setBootstrapSettled] = useState(false)
  const [hasModelProbeFailed, setModelProbeFailed] = useState(false)
  const [hasSdkWaitExpired, setHasSdkWaitExpired] = useState(false)
  const [startupDestination, setStartupDestination] = useState<ModelStartupDestination | null>(null)
  const [isModelOnboardingDismissed, setModelOnboardingDismissed] = useState(false)

  useEffect(() => {
    if (isSdkWaitBypassed) return

    let isCancelled = false
    let isSettled = false
    const probe = startModelProbe(modelStore)
    const timeoutId = window.setTimeout(() => {
      if (!isSettled && !isCancelled) setHasSdkWaitExpired(true)
    }, SDK_STARTUP_WAIT_MS)

    void probe.then(
      () => {
        isSettled = true
      },
      () => {
        isSettled = true
        if (!isCancelled) setModelProbeFailed(true)
      },
    )

    return () => {
      isCancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [isSdkWaitBypassed, modelStore])

  useEffect(() => {
    if (isProviderSettingsLoaded) return

    let isCancelled = false
    void loadModelSettings(modelStore).catch(() => {
      if (!isCancelled) modelStore.getState().replaceSettings([], {})
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
    hasConfiguredProviders,
    hasModelProbeFailed,
    hasSdkWaitExpired,
    isModelAccessResolved,
    isProjectCatalogLoaded: isBootstrapSettled,
    isProviderSettingsLoaded,
    isSdkInitializationComplete,
    isSdkWaitBypassed,
    startupDestination,
  })

  useEffect(() => {
    if (startupDestination || (phase !== 'onboarding' && phase !== 'workbench')) return
    setStartupDestination(phase)
  }, [phase, startupDestination])

  const dismissModelOnboarding = useCallback(() => {
    setModelOnboardingDismissed(true)
  }, [])

  return {
    dismissModelOnboarding,
    shouldShowModelOnboarding: phase === 'onboarding' && !isModelOnboardingDismissed,
    phase,
  }
}
