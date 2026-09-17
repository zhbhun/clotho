import {
  PROVIDER_ID_PATTERN,
  PROVIDER_MODEL_REASONING_LEVELS,
  normalizeProviderModelReasoning,
} from '@/shared/provider'
import type { ModelProvider, ProviderModel } from '@/shared/rpc'

const AUTH_FIELDS = ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_API_KEY']

const REASONING_LEVELS: readonly string[] = PROVIDER_MODEL_REASONING_LEVELS

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
    (candidate.reasoning === undefined ||
      (typeof candidate.reasoning === 'string' && REASONING_LEVELS.includes(candidate.reasoning)))
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
    typeof candidate.authField === 'string' &&
    AUTH_FIELDS.includes(candidate.authField) &&
    Array.isArray(candidate.models) &&
    candidate.models.every(isProviderModel) &&
    (candidate.presetId === undefined || typeof candidate.presetId === 'string') &&
    (candidate.modelsUrl === undefined || typeof candidate.modelsUrl === 'string')
  )
}

export function normalizeProvider(value: unknown): ModelProvider | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (!Array.isArray(candidate.models)) return null

  const normalized = {
    ...candidate,
    models: candidate.models.map((model) =>
      model && typeof model === 'object' && !Array.isArray(model)
        ? {
            ...model,
            reasoning: normalizeProviderModelReasoning(
              (model as Record<string, unknown>).reasoning,
            ),
          }
        : model,
    ),
  }
  return isProvider(normalized) ? normalized : null
}
