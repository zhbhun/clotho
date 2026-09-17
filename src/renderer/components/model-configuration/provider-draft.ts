import {
  DEFAULT_PROVIDER_MODEL_REASONING,
  PROVIDER_ID_PATTERN,
  normalizeProviderModelReasoning,
} from '@/shared/provider'

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
    authField: 'ANTHROPIC_AUTH_TOKEN',
    models: [],
  }
}

export function createModelDraft(): ProviderModel {
  return {
    id: '',
    displayName: '',
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    reasoning: DEFAULT_PROVIDER_MODEL_REASONING,
  }
}

export function providerFromPreset(preset: ProviderPreset): ModelProvider {
  return {
    id: preset.id,
    name: preset.name,
    baseURL: preset.baseURL,
    authToken: '',
    authField: preset.authField,
    models: preset.models.map((model) => ({
      ...model,
      reasoning: normalizeProviderModelReasoning(model.reasoning),
    })),
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

export function createFetchedModelDraft(id: string): ProviderModel {
  return {
    id,
    displayName: friendlyModelName(id),
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    reasoning: DEFAULT_PROVIDER_MODEL_REASONING,
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
