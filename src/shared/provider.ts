/**
 * Shared model provider contracts used by both the Bun backend and the
 * renderer frontend.
 */

/**
 * Valid provider ID shape: starts with a lowercase letter or digit, followed
 * by lowercase letters, digits, dots, underscores, or dashes.
 */
export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

/** All Claude built-in model mapping roles, in display order. */
export const CLAUDE_MODEL_MAPPING_ROLES = [
  'sonnet',
  'opus',
  'fable',
  'haiku',
  'subagent',
  'fallback',
] as const

export type ClaudeModelMappingRole = (typeof CLAUDE_MODEL_MAPPING_ROLES)[number]

/** Upstream API dialect a provider speaks. */
export const PROVIDER_API_TYPES = ['anthropic-messages', 'chat-completions'] as const

export type ProviderApiType = (typeof PROVIDER_API_TYPES)[number]

export const DEFAULT_PROVIDER_API_TYPE: ProviderApiType = 'anthropic-messages'

export function normalizeProviderApiType(value: unknown): ProviderApiType {
  return typeof value === 'string' && (PROVIDER_API_TYPES as readonly string[]).includes(value)
    ? (value as ProviderApiType)
    : DEFAULT_PROVIDER_API_TYPE
}

/**
 * Claude SDK reasoning effort levels. `none` disables thinking; the remaining
 * values are the effort tiers Claude can send in a request.
 */
export const PROVIDER_MODEL_REASONING_LEVELS = [
  'none',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const

export type ProviderModelReasoning = (typeof PROVIDER_MODEL_REASONING_LEVELS)[number]

/**
 * baseURL fragments of providers with a known quota endpoint. Only providers
 * matching one of these are queried for usage; anything else must not fire a
 * speculative request. Keep in sync with the query implementations in
 * `src/main/claude/provider-usage.ts`.
 */
export const PROVIDER_USAGE_URL_PATTERNS = [
  'api.kimi.com/coding',
  'bigmodel.cn',
  'api.z.ai',
  'api.minimaxi.com',
  'api.minimax.io',
  'api.deepseek.com',
  'api.siliconflow.cn',
  'api.siliconflow.com',
  'openrouter.ai',
] as const

export function isProviderUsageSupported(baseURL: string): boolean {
  const url = baseURL.toLowerCase()
  return PROVIDER_USAGE_URL_PATTERNS.some((pattern) => url.includes(pattern))
}
