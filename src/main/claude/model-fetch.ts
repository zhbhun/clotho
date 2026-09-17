import type { FetchProviderModelsParams, ProviderAuthField } from '@/shared/rpc'

/** Build candidate model URLs, falling back to baseURL variants when modelsUrl is absent. */
export function buildCandidates(baseURL: string, modelsUrl?: string): string[] {
  if (modelsUrl) return [modelsUrl]
  const trimmed = baseURL.replace(/\/+$/, '')
  const candidates = [`${trimmed}/v1/models`, `${trimmed}/models`]
  const stripped = trimmed.replace(/\/anthropic\/?$/, '')
  if (stripped !== trimmed) {
    candidates.push(`${stripped}/v1/models`, `${stripped}/models`)
  }
  return candidates
}

/** Build authentication headers from the configured auth field. */
export function authHeader(authField: ProviderAuthField, token: string): Record<string, string> {
  return authField === 'ANTHROPIC_API_KEY'
    ? { 'x-api-key': token }
    : { Authorization: `Bearer ${token}` }
}

/** Parse model IDs from OpenAI-shaped `{ data: [{ id }] }` or bare-array responses. */
export function parseModelIds(json: unknown): string[] {
  const list = Array.isArray(json) ? json : (json as { data?: unknown } | null)?.data
  if (!Array.isArray(list)) return []
  return list
    .map((item) => (item as { id?: unknown } | null)?.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/** Try candidate URLs in order and return IDs from the first successful response. */
export async function fetchProviderModels({
  baseURL,
  authToken,
  authField,
  modelsUrl,
}: FetchProviderModelsParams): Promise<string[]> {
  const candidates = buildCandidates(baseURL, modelsUrl)
  const headers = { ...authHeader(authField, authToken), Accept: 'application/json' }
  const errors: string[] = []

  for (const url of candidates) {
    try {
      const response = await fetch(url, { headers })
      if (!response.ok) {
        errors.push(`${url} -> HTTP ${response.status}`)
        continue
      }
      const ids = parseModelIds(await response.json())
      if (ids.length > 0) return ids
      errors.push(`${url} -> empty`)
    } catch (caught) {
      errors.push(`${url} -> ${caught instanceof Error ? caught.message : 'fetch failed'}`)
    }
  }

  throw new Error(`All candidates failed: ${errors.join('; ')}`)
}
