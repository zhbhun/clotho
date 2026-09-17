import type { ClaudeModelInfo, ClaudeModelMappings } from '../../../../services/claude/claude'

export type ModelSelectionState = {
  availableModels: ClaudeModelInfo[]
  defaultModelId?: string
  defaultProviderId?: string
  isModelCatalogLoaded: boolean
  isSdkInitializationComplete: boolean
  modelMappings: ClaudeModelMappings
  selectedModelId: string | null
  selectedProviderId: string | null
}

/** Resolve the effective provider and model: session choice > project default > global fallback > first available model. */
export function resolveModelSelection(params: {
  selectedProviderId: string | null
  selectedModelId: string | null
  defaultProviderId?: string
  defaultModelId?: string
  fallbackModel?: string
  isModelCatalogLoaded?: boolean
  isSdkInitializationComplete?: boolean
  models: ClaudeModelInfo[]
}): { selectedProviderId: string; selectedModelId: string } | null {
  const isAvailable = (providerId: string, modelId: string) =>
    params.isModelCatalogLoaded === false ||
    (providerId === 'claude' && params.isSdkInitializationComplete === false) ||
    params.models.some((model) => model.providerId === providerId && model.value === modelId)

  if (
    params.selectedProviderId &&
    params.selectedModelId &&
    isAvailable(params.selectedProviderId, params.selectedModelId)
  ) {
    return {
      selectedProviderId: params.selectedProviderId,
      selectedModelId: params.selectedModelId,
    }
  }
  if (
    params.defaultProviderId &&
    params.defaultModelId &&
    isAvailable(params.defaultProviderId, params.defaultModelId)
  ) {
    return {
      selectedProviderId: params.defaultProviderId,
      selectedModelId: params.defaultModelId,
    }
  }
  const fallbackSeparator = params.fallbackModel?.indexOf('/') ?? -1
  if (params.fallbackModel && fallbackSeparator > 0) {
    const providerId = params.fallbackModel.slice(0, fallbackSeparator)
    const modelId = params.fallbackModel.slice(fallbackSeparator + 1)
    if (isAvailable(providerId, modelId)) {
      return { selectedProviderId: providerId, selectedModelId: modelId }
    }
  }
  const first = params.models.find((model) => model.providerId && model.value)
  if (first?.providerId && first?.value) {
    return { selectedProviderId: first.providerId, selectedModelId: first.value }
  }
  return null
}

export function resolveSessionModel(state: ModelSelectionState) {
  return resolveModelSelection({
    selectedProviderId: state.selectedProviderId,
    selectedModelId: state.selectedModelId,
    defaultProviderId: state.defaultProviderId,
    defaultModelId: state.defaultModelId,
    fallbackModel: state.modelMappings?.fallback,
    isModelCatalogLoaded: state.isModelCatalogLoaded,
    isSdkInitializationComplete: state.isSdkInitializationComplete,
    models: state.availableModels,
  })
}

/** The qualified `<provider>/<model>` a new turn would use, or null when unusable. */
export function qualifiedSessionModel(state: ModelSelectionState): string | null {
  const selection = resolveSessionModel(state)
  return selection ? `${selection.selectedProviderId}/${selection.selectedModelId}` : null
}

/** Look up the catalog entry behind a `providerId/modelId` qualified model; undefined when unknown. */
export function findQualifiedModel(models: ClaudeModelInfo[], qualifiedModel: string) {
  const separator = qualifiedModel.indexOf('/')
  if (separator <= 0) return undefined
  const providerId = qualifiedModel.slice(0, separator)
  const modelId = qualifiedModel.slice(separator + 1)
  return models.find((model) => model.providerId === providerId && model.value === modelId)
}
