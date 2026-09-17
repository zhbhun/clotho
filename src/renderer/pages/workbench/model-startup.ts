export type ModelStartupPhase = 'bootstrap-loading' | 'sdk-loading' | 'onboarding' | 'workbench'
export type ModelStartupDestination = Extract<ModelStartupPhase, 'onboarding' | 'workbench'>

export type ModelStartupState = {
  hasClaudeAuthentication: boolean
  hasConfiguredProviders: boolean
  hasModelProbeFailed: boolean
  hasSdkWaitExpired: boolean
  isModelAccessResolved: boolean
  isProjectCatalogLoaded: boolean
  isProviderSettingsLoaded: boolean
  isSdkInitializationComplete: boolean
  isSdkWaitBypassed: boolean
  startupDestination?: ModelStartupDestination | null
}

export function getModelStartupPhase(state: ModelStartupState): ModelStartupPhase {
  if (state.startupDestination) return state.startupDestination
  if (!state.isProjectCatalogLoaded || !state.isProviderSettingsLoaded) {
    return 'bootstrap-loading'
  }
  if (
    state.hasConfiguredProviders ||
    state.hasClaudeAuthentication ||
    state.hasSdkWaitExpired ||
    state.isSdkWaitBypassed
  ) {
    return 'workbench'
  }
  if (state.isModelAccessResolved || state.hasModelProbeFailed) return 'onboarding'
  if (state.isSdkInitializationComplete) return 'workbench'
  return 'sdk-loading'
}
