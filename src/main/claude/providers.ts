import {
  PROVIDER_API_TYPES,
  PROVIDER_ID_PATTERN,
  normalizeProviderApiType,
} from '@/shared/provider'
import type { ModelProvider, ProviderModel } from '@/shared/rpc'

function normalizeThinkingLevel(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : 'on'
}

function normalizeThinkingPresetId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function isProviderModel(value: unknown): value is ProviderModel {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.contextWindow === 'number' &&
    Number.isInteger(candidate.contextWindow) &&
    candidate.contextWindow > 0 &&
    (candidate.supportsMultimodal === undefined ||
      typeof candidate.supportsMultimodal === 'boolean') &&
    (candidate.thinkingLevel === undefined ||
      (typeof candidate.thinkingLevel === 'string' && candidate.thinkingLevel.trim().length > 0)) &&
    (candidate.thinkingPresetId === undefined || typeof candidate.thinkingPresetId === 'string')
  )
}

export function isProvider(value: unknown): value is ModelProvider {
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as Record<string, unknown>
  return (
    typeof candidate.id === 'string' &&
    PROVIDER_ID_PATTERN.test(candidate.id) &&
    typeof candidate.name === 'string' &&
    typeof candidate.baseURL === 'string' &&
    typeof candidate.authToken === 'string' &&
    Array.isArray(candidate.models) &&
    candidate.models.every(isProviderModel) &&
    (candidate.presetId === undefined || typeof candidate.presetId === 'string') &&
    (candidate.modelsUrl === undefined || typeof candidate.modelsUrl === 'string') &&
    (candidate.apiType === undefined ||
      (PROVIDER_API_TYPES as readonly string[]).includes(candidate.apiType as string))
  )
}

export function normalizeProvider(value: unknown): ModelProvider | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (!Array.isArray(candidate.models)) return null

  const normalized: Record<string, unknown> = {
    id: candidate.id,
    name: candidate.name,
    baseURL: candidate.baseURL,
    authToken: candidate.authToken,
    apiType: normalizeProviderApiType(candidate.apiType),
    models: candidate.models.map((model) =>
      model && typeof model === 'object' && !Array.isArray(model)
        ? {
            id: (model as Record<string, unknown>).id,
            displayName: (model as Record<string, unknown>).displayName,
            contextWindow: (model as Record<string, unknown>).contextWindow,
            supportsMultimodal: (model as Record<string, unknown>).supportsMultimodal,
            thinkingLevel: normalizeThinkingLevel((model as Record<string, unknown>).thinkingLevel),
            thinkingPresetId: normalizeThinkingPresetId(
              (model as Record<string, unknown>).thinkingPresetId,
            ),
          }
        : model,
    ),
  }
  if (typeof candidate.presetId === 'string') normalized.presetId = candidate.presetId
  if (typeof candidate.modelsUrl === 'string') normalized.modelsUrl = candidate.modelsUrl
  return isProvider(normalized) ? (normalized as ModelProvider) : null
}
