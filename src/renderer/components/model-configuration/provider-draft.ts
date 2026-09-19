import { DEFAULT_PROVIDER_API_TYPE, PROVIDER_ID_PATTERN } from '@/shared/provider'
import {
  GENERIC_REASONING_PRESET,
  findReasoningPreset,
  matchReasoningPreset,
} from '@/shared/reasoning'

import type { ModelProvider, ProviderModel } from '../../services/claude/claude'
import type { ProviderPreset } from './provider-presets'

/** Context window assigned to models added by hand or discovered via fetching. */
export const DEFAULT_CONTEXT_WINDOW = 250_000

export function createProviderDraft(): ModelProvider {
  return {
    id: '',
    name: '',
    baseURL: '',
    authToken: '',
    apiType: DEFAULT_PROVIDER_API_TYPE,
    models: [],
  }
}

export function createModelDraft(): ProviderModel {
  return {
    id: '',
    displayName: '',
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    thinkingLevel: GENERIC_REASONING_PRESET.defaultModelLevel,
    thinkingPresetId: GENERIC_REASONING_PRESET.id,
  }
}

export function providerFromPreset(preset: ProviderPreset): ModelProvider {
  return {
    id: preset.id,
    name: preset.name,
    baseURL: preset.baseURL,
    authToken: '',
    apiType: DEFAULT_PROVIDER_API_TYPE,
    models: preset.models.map((model) => {
      const reasoningPreset = matchReasoningPreset(preset.id, model.id)
      return {
        ...model,
        thinkingLevel: model.thinkingLevel ?? reasoningPreset.defaultModelLevel,
        thinkingPresetId: model.thinkingPresetId ?? reasoningPreset.id,
      }
    }),
    presetId: preset.id,
    modelsUrl: preset.modelsUrl,
  }
}

/** Generate a friendly display name from a model ID after fetching models. */
export function friendlyModelName(id: string): string {
  return id
    .replace(/^[\w-]+\//, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim()
}

export function createFetchedModelDraft(id: string, providerId?: string): ProviderModel {
  const reasoningPreset = matchReasoningPreset(providerId ?? '', id)
  return {
    id,
    displayName: friendlyModelName(id),
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    thinkingLevel: reasoningPreset.defaultModelLevel,
    thinkingPresetId: reasoningPreset.id,
  }
}

/**
 * Preset thinking config for a model ID (matched against the provider ID
 * too), or undefined when the current level should be kept: models whose
 * level was hand-picked stay as-is.
 */
export function autoThinkingForModel(
  providerId: string,
  modelId: string,
  current: { thinkingLevel?: string; thinkingPresetId?: string },
): Pick<ProviderModel, 'thinkingLevel' | 'thinkingPresetId'> | undefined {
  if (current.thinkingLevel !== undefined) {
    // A hand-picked level survives; only a level that still equals the
    // default of the preset it came from is treated as untouched.
    const currentPreset = findReasoningPreset(current.thinkingPresetId)
    if (current.thinkingLevel !== currentPreset?.defaultModelLevel) return undefined
  }
  const reasoningPreset = matchReasoningPreset(providerId, modelId)
  return {
    thinkingLevel: reasoningPreset.defaultModelLevel,
    thinkingPresetId: reasoningPreset.id,
  }
}

export type ProviderIdErrorKind = 'required' | 'format' | 'duplicate'

/** Validate a provider ID; callers map the returned kind to a localized message. */
export function getProviderIdErrorKind(
  id: string,
  providers: ModelProvider[],
  isCreating: boolean,
): ProviderIdErrorKind | null {
  if (!id) return 'required'
  if (!PROVIDER_ID_PATTERN.test(id)) return 'format'
  if (isCreating && providers.some((provider) => provider.id === id)) return 'duplicate'
  return null
}

export function isValidContextWindow(contextWindow: number): boolean {
  return Number.isInteger(contextWindow) && contextWindow > 0
}

/** Indexes of models whose ID is blank. */
export function getEmptyModelIdIndexes(models: ProviderModel[]): number[] {
  return models.flatMap((model, index) => (model.id.trim() ? [] : [index]))
}

export function hasInvalidContextWindow(models: ProviderModel[]): boolean {
  return models.some((model) => !isValidContextWindow(model.contextWindow))
}

/** Indexes of models with a blank ID or an invalid context window. */
export function getInvalidModelIndexes(models: ProviderModel[]): number[] {
  return models.flatMap((model, index) =>
    model.id.trim() && isValidContextWindow(model.contextWindow) ? [] : [index],
  )
}

/** Insert a new provider or replace the existing one in place, preserving list order. */
export function upsertProvider(
  providers: ModelProvider[],
  provider: ModelProvider,
): ModelProvider[] {
  const index = providers.findIndex((item) => item.id === provider.id)
  if (index < 0) return [...providers, provider]
  return providers.map((item, itemIndex) => (itemIndex === index ? provider : item))
}

/** Reindex model error markers after removing the model at `removedIndex`. */
export function shiftModelIdErrorIndexes(indexes: number[], removedIndex: number): number[] {
  return indexes
    .filter((errorIndex) => errorIndex !== removedIndex)
    .map((errorIndex) => (errorIndex > removedIndex ? errorIndex - 1 : errorIndex))
}
