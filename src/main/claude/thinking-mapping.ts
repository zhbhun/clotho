/**
 * Thinking translation for the local model proxy. The forward direction
 * (`sessionThinkingFor`) picks the claude query vocabulary a session runs
 * with; the reverse direction (`resolveRequestThinking` and friends) maps one
 * request's claude thinking params back to the model's native level through
 * its reasoning preset.
 */
import { PROVIDER_MODEL_REASONING_LEVELS } from '@/shared/provider'
import {
  type AnthropicThinkingStyle,
  type ReasoningSwitchStyle,
  claudeLevelFor,
  findReasoningPreset,
  modelLevelFor,
} from '@/shared/reasoning'
import type { ProviderModel, ProviderModelReasoning } from '@/shared/rpc'

import type { ChatThinkingConfig } from './chat-completions-request'
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
 * `thinking` param carries the on/off axis (translated per upstream, no preset
 * needed); a claude effort tier is reverse-mapped through the model's linked
 * preset. Out-of-set efforts and missing signals fall back to the configured
 * `thinkingLevel`.
 */
export function resolveRequestThinking(
  model: ProviderModel,
  body: Record<string, unknown>,
): {
  level: string
  switchStyle: ReasoningSwitchStyle
  anthropicOn: AnthropicThinkingStyle
} {
  const preset = findReasoningPreset(model.thinkingPresetId)
  const defaultLevel = model.thinkingLevel ?? preset?.defaultModelLevel ?? 'on'
  const switchStyle = preset?.switchStyle ?? 'thinking'
  const anthropicOn = preset?.anthropicOn ?? 'enabled'
  const thinkingType = claudeThinkingType(body)

  if (thinkingType === 'disabled') {
    if (preset) {
      const offRow = preset.mappings.find((row) => row.claudeLevel === 'none')
      if (offRow) return { level: offRow.modelLevel, switchStyle, anthropicOn }
      return { level: defaultLevel, switchStyle, anthropicOn }
    }
    return { level: 'off', switchStyle, anthropicOn }
  }

  const claudeEffort = claudeEffortOf(body)
  if (claudeEffort && preset) {
    return {
      level: modelLevelFor(preset, claudeEffort, defaultLevel),
      switchStyle,
      anthropicOn,
    }
  }

  // Explicit "thinking on" without a tier (unknown models run this path).
  if (thinkingType === 'adaptive' || thinkingType === 'enabled') {
    const hasOnLevel = !preset || preset.mappings.some((row) => row.modelLevel === 'on')
    if (hasOnLevel) return { level: 'on', switchStyle, anthropicOn }
  }

  return { level: defaultLevel, switchStyle, anthropicOn }
}

export function chatThinkingConfig(
  model: ProviderModel,
  body: Record<string, unknown>,
): ChatThinkingConfig | undefined {
  const { level, switchStyle } = resolveRequestThinking(model, body)
  if (level === 'off') return { mode: 'off', switchStyle }
  if (level === 'on') {
    // An explicit claude thinking signal or a stored selection sends the
    // switch; fully unconfigured models keep the upstream default.
    const explicit = model.thinkingLevel !== undefined || claudeThinkingType(body) !== undefined
    return explicit ? { mode: 'on', switchStyle } : undefined
  }
  return { mode: 'effort', level }
}

/**
 * Rewrite a request's thinking config to the resolved thinking level. Effort
 * tiers pin `output_config.effort`, `off` disables thinking, and `on` sends
 * adaptive thinking without an effort. Other `output_config` keys (such as
 * format) are preserved.
 */
export function applyThinking(
  body: Record<string, unknown>,
  model: ProviderModel,
): Record<string, unknown> {
  const { level, anthropicOn } = resolveRequestThinking(model, body)
  const next: Record<string, unknown> = {
    ...body,
    thinking: level === 'off' ? { type: 'disabled' } : { type: anthropicOn },
  }
  const outputConfig = isPlainObject(body.output_config) ? { ...body.output_config } : {}
  if (level === 'off' || level === 'on') {
    delete outputConfig.effort
  } else {
    outputConfig.effort = level
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
