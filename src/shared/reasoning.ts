/**
 * Reasoning presets shared by the renderer (Reasoning dropdown options) and
 * the model proxy (claude level ⇄ model level translation). Each preset has a
 * stable id — models reference it through `thinkingPresetId` — and maps every
 * selectable model thinking level to a Claude SDK effort level.
 *
 * Levels reflect each family's official thinking controls as of 2026-09;
 * values Claude cannot request (e.g. OpenAI `minimal`, GLM `none` aliases) are
 * folded away. `off` maps to the claude `none` level, which disables thinking.
 */
import type { ProviderModelReasoning } from './provider'

/** One preset row: a model thinking level and the Claude effort it maps to. */
export interface ReasoningMappingRow {
  modelLevel: string
  claudeLevel: ProviderModelReasoning
}

/**
 * How a preset's on/off switch is expressed on a Chat Completions upstream:
 * `thinking` is the DeepSeek/GLM/Kimi/MiMo convention (`thinking.type`
 * enabled/disabled), `thinking-adaptive` is MiniMax M3 (on = adaptive), and
 * Qwen uses a boolean `enable_thinking`. Effort tiers are always
 * `reasoning_effort` on that endpoint shape.
 */
export type ReasoningSwitchStyle = 'thinking' | 'thinking-adaptive' | 'enable-thinking'

/**
 * How "thinking on" is expressed on an Anthropic-compatible upstream: real
 * Claude/Gemini/Grok/OpenAI proxies take `adaptive`, while DeepSeek/GLM/Kimi/
 * Qwen/MiMo/MiniMax document `enabled` (MiniMax M3 takes `adaptive`).
 */
export type AnthropicThinkingStyle = 'adaptive' | 'enabled'

/** A named thinking-level mapping for one model family. */
export interface ReasoningPreset {
  id: string
  /** Selectable model levels, in display order. */
  mappings: ReasoningMappingRow[]
  /** Level selected when a model is added or auto-filled. */
  defaultModelLevel: string
  /** Switch wire style, consulted only for presets offering on/off levels. */
  switchStyle: ReasoningSwitchStyle
  /** Wire value of `thinking.type` for "thinking on" on anthropic upstreams. */
  anthropicOn: AnthropicThinkingStyle
}

function preset(
  id: string,
  rows: Array<[modelLevel: string, claudeLevel: ProviderModelReasoning]>,
  defaultModelLevel = 'high',
  options: {
    switchStyle?: ReasoningSwitchStyle
    anthropicOn?: AnthropicThinkingStyle
  } = {},
): ReasoningPreset {
  return {
    id,
    mappings: rows.map(([modelLevel, claudeLevel]) => ({ modelLevel, claudeLevel })),
    defaultModelLevel,
    switchStyle: options.switchStyle ?? 'thinking',
    anthropicOn: options.anthropicOn ?? 'enabled',
  }
}

/** Match order decides precedence; keep more specific model versions first. */
const MODEL_REASONING_PRESETS: Array<{ modelPatterns: RegExp[]; preset: ReasoningPreset }> = [
  // GLM-5.3 always thinks; reasoning_effort only accepts low/high/max.
  {
    modelPatterns: [/glm-5\.3/],
    preset: preset('glm-5-3', [
      ['low', 'low'],
      ['high', 'high'],
      ['max', 'max'],
    ]),
  },
  // GLM-5.2 accepts the full ladder plus thinking disabled.
  {
    modelPatterns: [/glm-5\.2/],
    preset: preset('glm-5-2', [
      ['off', 'none'],
      ['low', 'low'],
      ['medium', 'medium'],
      ['high', 'high'],
      ['xhigh', 'xhigh'],
      ['max', 'max'],
    ]),
  },
  // OpenAI reasoning models: none/minimal exist but map poorly to Claude; no
  // official anthropic-compat endpoint, so proxies decide (CLI retries).
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
      'high',
      { anthropicOn: 'adaptive' },
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
      'high',
      { anthropicOn: 'adaptive' },
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
      'high',
      { anthropicOn: 'adaptive' },
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
      'high',
      { anthropicOn: 'adaptive' },
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
      'off',
      { switchStyle: 'thinking-adaptive', anthropicOn: 'adaptive' },
    ),
  },
  // Kimi: effort tiers only on kimi-k3. K2.7-code always thinks; K2.6 is a
  // plain thinking switch.
  {
    modelPatterns: [/kimi-k2\.7/],
    preset: preset('kimi-k2-7-code', [['on', 'high']], 'on'),
  },
  {
    modelPatterns: [/kimi-k2\.6/],
    preset: preset(
      'kimi-k2-6',
      [
        ['off', 'none'],
        ['on', 'high'],
      ],
      'on',
    ),
  },
  {
    modelPatterns: [/kimi|moonshot|k3/],
    preset: preset('kimi', [
      ['low', 'low'],
      ['high', 'high'],
      ['max', 'max'],
    ]),
  },
  // DeepSeek: reasoning_effort low/high/max plus the thinking switch (other
  // values are aliases of these three tiers).
  {
    modelPatterns: [/deepseek/],
    preset: preset('deepseek', [
      ['off', 'none'],
      ['low', 'low'],
      ['high', 'high'],
      ['max', 'max'],
    ]),
  },
  // Qwen 3.8 exposes reasoning_effort low/medium/xhigh; no high level, so the
  // closest lower level (medium) is the default.
  {
    modelPatterns: [/qwen/],
    preset: preset(
      'qwen',
      [
        ['low', 'low'],
        ['medium', 'medium'],
        ['xhigh', 'xhigh'],
      ],
      'medium',
      { switchStyle: 'enable-thinking' },
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
      'high',
      { anthropicOn: 'adaptive' },
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
      'high',
      { anthropicOn: 'adaptive' },
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
      'high',
      { anthropicOn: 'adaptive' },
    ),
  },
]

/** Provider defaults for new models that match no specific preset above. */
const PROVIDER_REASONING_PRESETS: Array<{ providerPatterns: RegExp[]; preset: ReasoningPreset }> = [
  { providerPatterns: [/zhipu/], preset: MODEL_REASONING_PRESETS[0]!.preset },
  { providerPatterns: [/deepseek/], preset: findInCatalog('deepseek')! },
  { providerPatterns: [/kimi|moonshot/], preset: findInCatalog('kimi')! },
  { providerPatterns: [/qwen|tongyi|qianwen/], preset: findInCatalog('qwen')! },
  { providerPatterns: [/openai/], preset: findInCatalog('openai')! },
  { providerPatterns: [/gemini|google/], preset: findInCatalog('gemini-3')! },
  { providerPatterns: [/xai|grok/], preset: findInCatalog('grok')! },
  { providerPatterns: [/meta/], preset: findInCatalog('muse-spark')! },
  { providerPatterns: [/anthropic|claude/], preset: findInCatalog('claude')! },
]

function findInCatalog(id: string): ReasoningPreset | undefined {
  return MODEL_REASONING_PRESETS.find((entry) => entry.preset.id === id)?.preset
}

/** Fallback preset for models matching no family: a plain thinking switch. */
export const GENERIC_REASONING_PRESET: ReasoningPreset = preset(
  'generic',
  [
    ['off', 'none'],
    ['on', 'high'],
  ],
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
