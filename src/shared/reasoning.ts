/**
 * Reasoning presets shared by the renderer (Reasoning dropdown options) and
 * the model proxy (claude level ⇄ native request translation). Each preset has
 * a stable id — models reference it through `thinkingPresetId` — and carries
 * the selectable model levels plus the wire params each upstream API type
 * receives for a level.
 *
 * Level sets and wire vocabularies follow ZCode's builtin model rules as of
 * 2026-09, with two compatibility deviations: gpt models send bare
 * `reasoning_effort` on chat upstreams (ZCode's own gpt-5.4 chat map; the
 * kitchen-sink default is reserved for unknown families), and the unknown-
 * model fallback sends `thinking.type: enabled` on anthropic upstreams —
 * the older, more widely supported value over `adaptive`. Claude values it
 * cannot request (e.g. `minimal`) are folded away; `disabled`/`none` map to
 * the UI level `off`, `enabled` to `on`.
 */
import type { ProviderModelReasoning } from './provider'

/** One preset row: a model thinking level and the Claude effort it maps to. */
export interface ReasoningMappingRow {
  modelLevel: string
  claudeLevel: ProviderModelReasoning
}

/** Request params one upstream API type receives for a model thinking level. */
export type ReasoningWireParams = Record<string, unknown>

/** A named thinking-level mapping for one model family. */
export interface ReasoningPreset {
  id: string
  /** Selectable model levels, in display order. */
  mappings: ReasoningMappingRow[]
  /** Level selected when a model is added or auto-filled. */
  defaultModelLevel: string
  /** Params for an anthropic-messages upstream, by model level. */
  anthropicParams(level: string): ReasoningWireParams
  /** Params for a chat-completions upstream, by model level. */
  chatParams(level: string): ReasoningWireParams
}

type WireParams = ReasoningWireParams

/** Switch families speak `on`, upstreams expect a tier; `on` maps to high. */
function effortOf(level: string): string {
  return level === 'on' ? 'high' : level
}

function thinkingSwitch(type: 'disabled' | 'enabled' | 'adaptive'): WireParams {
  return { thinking: { type } }
}

function anthropicAdaptiveEffort(level: string): WireParams {
  if (level === 'off') return thinkingSwitch('disabled')
  return { thinking: { type: 'adaptive' }, output_config: { effort: effortOf(level) } }
}

/** Families whose anthropic dialect always thinks (glm-5.3, deepseek, generic). */
function anthropicEnabledEffort(level: string): WireParams {
  if (level === 'off') return thinkingSwitch('disabled')
  return { thinking: { type: 'enabled' }, output_config: { effort: effortOf(level) } }
}

/** Kimi's anthropic dialect: the effort alone, thinking deleted. */
function anthropicEffortOnly(level: string): WireParams {
  return { output_config: { effort: effortOf(level) } }
}

function anthropicSwitch(level: string): WireParams {
  return thinkingSwitch(level === 'off' ? 'disabled' : 'enabled')
}

function anthropicAdaptiveSwitch(level: string): WireParams {
  return thinkingSwitch(level === 'off' ? 'disabled' : 'adaptive')
}

function chatEffort(level: string): WireParams {
  return { reasoning_effort: level === 'off' ? 'none' : effortOf(level) }
}

/** Default for families without a known chat dialect: set every switch. */
function chatKitchenSink(level: string): WireParams {
  const off = level === 'off'
  const effort = off ? 'none' : effortOf(level)
  return {
    thinking: { type: off ? 'disabled' : 'enabled' },
    enable_thinking: !off,
    reasoning_effort: effort,
    reasoning: { effort },
  }
}

function chatSwitchEffort(level: string): WireParams {
  if (level === 'off') return thinkingSwitch('disabled')
  return { thinking: { type: 'enabled' }, reasoning_effort: effortOf(level) }
}

function chatEnableThinking(level: string): WireParams {
  return { enable_thinking: level !== 'off' }
}

function chatSwitch(level: string): WireParams {
  return thinkingSwitch(level === 'off' ? 'disabled' : 'enabled')
}

function chatAdaptiveSwitch(level: string): WireParams {
  return thinkingSwitch(level === 'off' ? 'disabled' : 'adaptive')
}

function preset(
  id: string,
  rows: Array<[modelLevel: string, claudeLevel: ProviderModelReasoning]>,
  wire: {
    anthropic: (level: string) => WireParams
    chat: (level: string) => WireParams
  },
  defaultModelLevel = 'high',
): ReasoningPreset {
  return {
    id,
    mappings: rows.map(([modelLevel, claudeLevel]) => ({ modelLevel, claudeLevel })),
    defaultModelLevel,
    anthropicParams: wire.anthropic,
    chatParams: wire.chat,
  }
}

/** Match order decides precedence; keep more specific model versions first. */
const MODEL_REASONING_PRESETS: Array<{ modelPatterns: RegExp[]; preset: ReasoningPreset }> = [
  // GLM-5.3 always thinks; the effort only accepts low/high/max.
  {
    modelPatterns: [/glm-5\.3/],
    preset: preset(
      'glm-5-3',
      [
        ['low', 'low'],
        ['high', 'high'],
        ['max', 'max'],
      ],
      { anthropic: anthropicEnabledEffort, chat: chatEffort },
    ),
  },
  // GLM-5.2 accepts off/high/max only.
  {
    modelPatterns: [/glm-5\.2/],
    preset: preset(
      'glm-5-2',
      [
        ['off', 'none'],
        ['high', 'high'],
        ['max', 'max'],
      ],
      { anthropic: anthropicEnabledEffort, chat: chatKitchenSink },
    ),
  },
  // Older GLM models (5.2-, 5.1, 5v, 4.x) only expose a thinking switch.
  {
    modelPatterns: [/glm-5(?:[.\-:/[].*)?$/, /glm-5v/, /glm-4/],
    preset: preset(
      'glm',
      [
        ['off', 'none'],
        ['on', 'high'],
      ],
      { anthropic: anthropicSwitch, chat: chatKitchenSink },
      'on',
    ),
  },
  // GPT ladders differ per generation: 5.6 reaches max and can disable
  // thinking, 5.4 stops at xhigh, 5.3-codex has neither off nor max.
  {
    modelPatterns: [/gpt-5\.6/],
    preset: preset(
      'gpt-5-6',
      [
        ['off', 'none'],
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
        ['max', 'max'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatEffort },
    ),
  },
  {
    modelPatterns: [/gpt-5\.4/],
    preset: preset(
      'gpt-5-4',
      [
        ['off', 'none'],
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatEffort },
    ),
  },
  {
    modelPatterns: [/gpt-5\.3-codex/],
    preset: preset(
      'gpt-5-3-codex',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatEffort },
    ),
  },
  {
    modelPatterns: [/gpt-6/],
    preset: preset(
      'gpt-6',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
        ['max', 'max'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatEffort },
    ),
  },
  // Remaining OpenAI reasoning models (o-series, unspecificed gpt-5.x).
  {
    modelPatterns: [/gpt-5/, /\bo[0-9]/],
    preset: preset(
      'openai',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
        ['max', 'max'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatEffort },
    ),
  },
  // Qwen 3.8 exposes reasoning_effort low/medium/xhigh; no high level, so the
  // closest lower level (medium) is the default.
  {
    modelPatterns: [/qwen3\.8/],
    preset: preset(
      'qwen',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['xhigh', 'xhigh'],
      ],
      { anthropic: anthropicEnabledEffort, chat: chatEffort },
      'medium',
    ),
  },
  // Qwen 3.7 and older speak the boolean enable_thinking switch.
  {
    modelPatterns: [/qwen/],
    preset: preset(
      'qwen-switch',
      [
        ['off', 'none'],
        ['on', 'high'],
      ],
      { anthropic: anthropicSwitch, chat: chatEnableThinking },
      'on',
    ),
  },
  // DeepSeek: reasoning_effort low/high/max plus the thinking switch (other
  // values are aliases of these three tiers).
  {
    modelPatterns: [/deepseek/],
    preset: preset(
      'deepseek',
      [
        ['off', 'none'],
        ['low', 'low'],
        ['high', 'high'],
        ['max', 'max'],
      ],
      { anthropic: anthropicEnabledEffort, chat: chatSwitchEffort },
    ),
  },
  // Kimi: effort tiers on k3-class models, and the anthropic dialect takes
  // the effort alone (thinking deleted); k2.7-code always thinks; k2.5/2.6
  // are plain thinking switches.
  {
    modelPatterns: [/kimi-k2\.7/],
    preset: preset(
      'kimi-k2-7-code',
      [['on', 'high']],
      { anthropic: anthropicSwitch, chat: chatSwitch },
      'on',
    ),
  },
  {
    modelPatterns: [/kimi-k2\.[56]/],
    preset: preset(
      'kimi-k2-6',
      [
        ['off', 'none'],
        ['on', 'high'],
      ],
      { anthropic: anthropicSwitch, chat: chatSwitch },
      'on',
    ),
  },
  {
    modelPatterns: [/k3/, /kimi|moonshot/],
    preset: preset(
      'kimi',
      [
        ['low', 'low'],
        ['high', 'high'],
        ['max', 'max'],
      ],
      { anthropic: anthropicEffortOnly, chat: chatEffort },
    ),
  },
  // MiMo: a plain thinking switch (mimo-v2.5 / v2.5-pro, default on).
  {
    modelPatterns: [/mimo/],
    preset: preset(
      'mimo',
      [
        ['off', 'none'],
        ['on', 'high'],
      ],
      { anthropic: anthropicSwitch, chat: chatSwitch },
      'on',
    ),
  },
  // MiniMax M3: thinking is a disabled/adaptive switch (default off). M2.x
  // cannot be configured and shares the provider default.
  {
    modelPatterns: [/minimax-m3/],
    preset: preset(
      'minimax-m3',
      [
        ['off', 'none'],
        ['on', 'high'],
      ],
      { anthropic: anthropicAdaptiveSwitch, chat: chatAdaptiveSwitch },
      'off',
    ),
  },
  // Gemini 3 Flash exposes minimal/low/medium/high; minimal is dropped.
  {
    modelPatterns: [/gemini-3-flash/],
    preset: preset(
      'gemini-3-flash',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatKitchenSink },
    ),
  },
  // Gemini 3.1 adds a medium thinking level over Gemini 3's low/high.
  {
    modelPatterns: [/gemini-3\.1/],
    preset: preset(
      'gemini-3-1',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatKitchenSink },
    ),
  },
  {
    modelPatterns: [/gemini-3/],
    preset: preset(
      'gemini-3',
      [
        ['low', 'low'],
        ['high', 'high'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatKitchenSink },
    ),
  },
  // Grok 4.6 accepts reasoning_effort low/medium/high/xhigh (4.5 treats xhigh
  // as high; reasoning cannot be fully disabled).
  {
    modelPatterns: [/grok/],
    preset: preset(
      'grok',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatKitchenSink },
    ),
  },
  // Meta Muse Spark exposes reasoning.effort minimal/low/medium/high/xhigh.
  {
    modelPatterns: [/muse[-_ ]?spark/],
    preset: preset(
      'muse-spark',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatKitchenSink },
    ),
  },
  // Claude via Anthropic-compatible endpoints: 1:1 effort ladder.
  {
    modelPatterns: [/claude|sonnet|opus|haiku/],
    preset: preset(
      'claude',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['xhigh', 'xhigh'],
        ['max', 'max'],
      ],
      { anthropic: anthropicAdaptiveEffort, chat: chatKitchenSink },
    ),
  },
]

/** Provider defaults for new models that match no specific preset above. */
const PROVIDER_REASONING_PRESETS: Array<{ providerPatterns: RegExp[]; preset: ReasoningPreset }> = [
  { providerPatterns: [/zhipu|zai|bigmodel/], preset: findInCatalog('glm')! },
  { providerPatterns: [/deepseek/], preset: findInCatalog('deepseek')! },
  { providerPatterns: [/kimi|moonshot/], preset: findInCatalog('kimi')! },
  { providerPatterns: [/qwen|tongyi|qianwen/], preset: findInCatalog('qwen-switch')! },
  { providerPatterns: [/openai/], preset: findInCatalog('openai')! },
  { providerPatterns: [/gemini|google/], preset: findInCatalog('gemini-3')! },
  { providerPatterns: [/xai|grok/], preset: findInCatalog('grok')! },
  { providerPatterns: [/meta/], preset: findInCatalog('muse-spark')! },
  { providerPatterns: [/anthropic|claude/], preset: findInCatalog('claude')! },
]

function findInCatalog(id: string): ReasoningPreset | undefined {
  return MODEL_REASONING_PRESETS.find((entry) => entry.preset.id === id)?.preset
}

/**
 * Fallback preset for models matching no family: a plain thinking switch.
 * The anthropic dialect uses the older `enabled` value — unknown gateways are
 * likelier to predate the `adaptive` extension.
 */
export const GENERIC_REASONING_PRESET: ReasoningPreset = preset(
  'generic',
  [
    ['off', 'none'],
    ['on', 'high'],
  ],
  { anthropic: anthropicEnabledEffort, chat: chatKitchenSink },
  'on',
)

/** Whether a level is some preset's default (i.e. still untouched by hand). */
export function isPresetDefaultLevel(level: string | undefined): boolean {
  if (!level) return false
  return MODEL_REASONING_PRESETS.some((entry) => entry.preset.defaultModelLevel === level)
}

/** Look up a preset by its stable id (`thinkingPresetId`). */
export function findReasoningPreset(id: string | undefined): ReasoningPreset | undefined {
  if (!id) return undefined
  const found = MODEL_REASONING_PRESETS.find((entry) => entry.preset.id === id)?.preset
  if (found) return found
  return id === GENERIC_REASONING_PRESET.id ? GENERIC_REASONING_PRESET : undefined
}

/**
 * Match a preset for a model: model-ID patterns first (so aggregators whose
 * provider ID matches nothing still get a family-appropriate preset), then the
 * provider default.
 */
export function matchReasoningPreset(providerId: string, modelId: string): ReasoningPreset {
  const model = modelId.toLowerCase()
  for (const entry of MODEL_REASONING_PRESETS) {
    if (entry.modelPatterns.some((pattern) => pattern.test(model))) return entry.preset
  }
  const provider = providerId.toLowerCase()
  for (const entry of PROVIDER_REASONING_PRESETS) {
    if (entry.providerPatterns.some((pattern) => pattern.test(provider))) return entry.preset
  }
  return GENERIC_REASONING_PRESET
}

/** Forward mapping: the claude effort to request for a model thinking level. */
export function claudeLevelFor(
  preset: ReasoningPreset,
  modelLevel: string | undefined,
): ProviderModelReasoning {
  const level = modelLevel ?? preset.defaultModelLevel
  return (
    preset.mappings.find((row) => row.modelLevel === level)?.claudeLevel ??
    preset.mappings.find((row) => row.modelLevel === preset.defaultModelLevel)!.claudeLevel
  )
}

/** Reverse mapping: the model thinking level for a claude effort. */
export function modelLevelFor(
  preset: ReasoningPreset,
  claudeLevel: ProviderModelReasoning,
  fallbackModelLevel: string,
): string {
  return (
    preset.mappings.find((row) => row.claudeLevel === claudeLevel)?.modelLevel ?? fallbackModelLevel
  )
}
