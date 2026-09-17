import { createStore } from 'zustand/vanilla'

import type {
  ClaudeInitializationResult,
  ClaudeModelInfo,
  ClaudeModelMappings,
  ModelProvider,
} from '../services/claude/claude'

export type ModelConfigurationState = {
  availableModels: ClaudeModelInfo[]
  claudeModels: ClaudeModelInfo[]
  hasClaudeAuthentication: boolean
  hasConfiguredProviders: boolean
  isModelAccessResolved: boolean
  isModelCatalogLoaded: boolean
  isSdkInitializationComplete: boolean
  isSettingsLoaded: boolean
  modelMappings: ClaudeModelMappings
  providers: ModelProvider[]
  initialize: (initialization: ClaudeInitializationResult) => void
  replaceSettings: (providers: ModelProvider[], mappings: ClaudeModelMappings) => void
}

export function providersToModelInfos(providers: ModelProvider[]): ClaudeModelInfo[] {
  return providers.flatMap((provider) =>
    provider.models.map((model) => ({
      value: model.id,
      displayName: model.displayName,
      description: '',
      providerId: provider.id,
      providerName: provider.name,
      contextWindow: model.contextWindow,
      supportsMultimodal: model.supportsMultimodal,
    })),
  )
}

export function createModelConfigurationStore() {
  return createStore<ModelConfigurationState>((set) => ({
    availableModels: [],
    claudeModels: [],
    hasClaudeAuthentication: false,
    hasConfiguredProviders: false,
    isModelAccessResolved: false,
    isModelCatalogLoaded: false,
    isSdkInitializationComplete: false,
    isSettingsLoaded: false,
    modelMappings: {},
    providers: [],
    initialize: (initialization) =>
      set((state) => {
        if (state.isSdkInitializationComplete) return state
        const claudeModels = initialization.models.filter((model) => model.providerId === 'claude')
        const providers = initialization.providers ?? state.providers
        const availableModels = [...initialization.models]
        for (const providerModel of providersToModelInfos(providers)) {
          if (
            !availableModels.some(
              (model) =>
                model.providerId === providerModel.providerId &&
                model.value === providerModel.value,
            )
          ) {
            availableModels.push(providerModel)
          }
        }
        const hasClaudeAuthentication =
          initialization.hasClaudeAuthentication ?? claudeModels.length > 0
        return {
          availableModels,
          claudeModels,
          hasClaudeAuthentication,
          hasConfiguredProviders:
            initialization.hasConfiguredProviders ??
            (!hasClaudeAuthentication && initialization.models.length > 0),
          isModelAccessResolved:
            initialization.hasClaudeAuthentication !== undefined &&
            initialization.hasConfiguredProviders !== undefined,
          isModelCatalogLoaded: true,
          isSdkInitializationComplete: true,
          isSettingsLoaded: state.isSettingsLoaded || initialization.providers !== undefined,
          modelMappings: initialization.modelMappings ?? state.modelMappings,
          providers,
        }
      }),
    replaceSettings: (providers, modelMappings) =>
      set((state) => ({
        availableModels: [...state.claudeModels, ...providersToModelInfos(providers)],
        hasConfiguredProviders: providers.length > 0,
        isModelCatalogLoaded: true,
        isSettingsLoaded: true,
        modelMappings,
        providers,
      })),
  }))
}

export type ModelConfigurationStore = ReturnType<typeof createModelConfigurationStore>
