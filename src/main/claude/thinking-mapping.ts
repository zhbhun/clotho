/**
 * Thinking translation for the local model proxy. The forward direction
 * (`sessionThinkingFor`) picks the claude query vocabulary a session runs
 * with; the reverse direction (`resolveRequestThinking` and friends) maps one
 * request's claude thinking params back to the model's native level through
 * its reasoning preset, whose wire params then drive the upstream request.
 */
import { PROVIDER_MODEL_REASONING_LEVELS } from '@/shared/provider'
import {
  GENERIC_REASONING_PRESET,
  type ReasoningPreset,
  type ReasoningWireParams,
  claudeLevelFor,
  findReasoningPreset,
  modelLevelFor,
} from '@/shared/reasoning'
import type { ProviderModel, ProviderModelReasoning } from '@/shared/rpc'

import { isPlainObject } from './object'

/** Session-level thinking config derived from the model's reasoning preset. */
export interface SessionThinking {
  /** Claude effort tier to run the session with. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** True when the model's level disables thinking entirely. */
  disabled?: boolean
  /** True for models without tiers: thinking on via the claude vocabulary. */
  enabled?: boolean
}

function claudeEffortOf(body: Record<string, unknown>): ProviderModelReasoning | undefined {
  const outputConfig = isPlainObject(body.output_config) ? body.output_config : undefined
  const effort = outputConfig?.effort
  return typeof effort === 'string' &&
    (PROVIDER_MODEL_REASONING_LEVELS as readonly string[]).includes(effort)
    ? (effort as ProviderModelReasoning)
    : undefined
}

function claudeThinkingType(body: Record<string, unknown>): string | undefined {
  return isPlainObject(body.thinking) && typeof body.thinking.type === 'string'
    ? body.thinking.type
    : undefined
}

/**
 * Resolve the model thinking level for one request. The request's claude
 * `thinking` param carries the on/off axis; a claude effort tier is
 * reverse-mapped through the model's linked preset. Out-of-set efforts and
 * missing signals fall back to the configured `thinkingLevel`.
 */
export function resolveRequestThinking(
  model: ProviderModel,
  body: Record<string, unknown>,
): { level: string; preset: ReasoningPreset | undefined } {
  const preset = findReasoningPreset(model.thinkingPresetId)
  const defaultLevel = model.thinkingLevel ?? preset?.defaultModelLevel ?? 'on'
  const thinkingType = claudeThinkingType(body)

  if (thinkingType === 'disabled') {
    if (preset) {
      const offRow = preset.mappings.find((row) => row.claudeLevel === 'none')
      if (offRow) return { level: offRow.modelLevel, preset }
      return { level: defaultLevel, preset }
    }
    return { level: 'off', preset }
  }

  const claudeEffort = claudeEffortOf(body)
  if (claudeEffort && preset) {
    return { level: modelLevelFor(preset, claudeEffort, defaultLevel), preset }
  }

  // Explicit "thinking on" without a tier (unknown models run this path).
  if (thinkingType === 'adaptive' || thinkingType === 'enabled') {
    const hasOnLevel = !preset || preset.mappings.some((row) => row.modelLevel === 'on')
    if (hasOnLevel) return { level: 'on', preset }
  }

  return { level: defaultLevel, preset }
}

/**
 * Thinking params for a Chat Completions upstream, derived from the model's
 * preset. Fully unconfigured models (no stored level, no claude signal) keep
 * the upstream default.
 */
export function chatThinkingParams(
  model: ProviderModel,
  body: Record<string, unknown>,
): ReasoningWireParams | undefined {
  const { level, preset } = resolveRequestThinking(model, body)
  if (
    level === 'on' &&
    model.thinkingLevel === undefined &&
    claudeThinkingType(body) === undefined
  ) {
    return undefined
  }
  return (preset ?? GENERIC_REASONING_PRESET).chatParams(level)
}

/**
 * Rewrite a request's thinking config to the resolved thinking level via the
 * preset's anthropic wire params. Other `output_config` keys (such as format)
 * are preserved.
 */
export function applyThinking(
  body: Record<string, unknown>,
  model: ProviderModel,
): Record<string, unknown> {
  const { level, preset } = resolveRequestThinking(model, body)
  const params = (preset ?? GENERIC_REASONING_PRESET).anthropicParams(level)
  const next: Record<string, unknown> = { ...body }
  if (isPlainObject(params.thinking)) {
    next.thinking = params.thinking
  } else {
    delete next.thinking
  }
  const outputConfig = isPlainObject(body.output_config) ? { ...body.output_config } : {}
  const paramOutput = isPlainObject(params.output_config) ? params.output_config : undefined
  if (paramOutput && 'effort' in paramOutput) {
    outputConfig.effort = paramOutput.effort
  } else {
    delete outputConfig.effort
  }
  if (Object.keys(outputConfig).length) {
    next.output_config = outputConfig
  } else {
    delete next.output_config
  }
  return next
}

/** Forward mapping: the claude effort/thinking for a session on this model. */
export function sessionThinkingFor(model: ProviderModel | undefined): SessionThinking {
  const preset = findReasoningPreset(model?.thinkingPresetId)
  if (!preset) {
    // Unknown models speak the claude thinking vocabulary directly: the
    // on/off selection maps onto ThinkingConfig, no preset needed.
    return model?.thinkingLevel === 'off' ? { disabled: true } : { enabled: true }
  }
  const claudeLevel = claudeLevelFor(preset, model?.thinkingLevel ?? preset.defaultModelLevel)
  return claudeLevel === 'none' ? { disabled: true } : { effort: claudeLevel }
}
