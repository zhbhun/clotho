export type ModelStartupPhase = 'bootstrap-loading' | 'sdk-loading' | 'onboarding' | 'workbench'

export type ModelStartupState = {
  hasClaudeAuthentication: boolean
  hasConfiguredClaudeModels: boolean
  hasConfiguredProviders: boolean
  hasModelProbeFailed: boolean
  isModelAccessResolved: boolean
  isModelProbePending: boolean
  isProjectCatalogLoaded: boolean
  isProviderSettingsLoaded: boolean
  isSdkInitializationComplete: boolean
  isSdkWaitBypassed: boolean
}

export function getModelStartupPhase(state: ModelStartupState): ModelStartupPhase {
  if (!state.isProjectCatalogLoaded || !state.isProviderSettingsLoaded) return 'bootstrap-loading'
  if (state.isSdkWaitBypassed || state.hasConfiguredProviders) return 'workbench'
  if (state.isModelProbePending) return 'sdk-loading'
  if (state.hasClaudeAuthentication || state.hasConfiguredClaudeModels) return 'workbench'
  if (state.isModelAccessResolved || state.hasModelProbeFailed || state.isSdkInitializationComplete)
    return 'onboarding'
  return 'sdk-loading'
}
