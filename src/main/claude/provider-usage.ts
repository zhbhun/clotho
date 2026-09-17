import { isProviderUsageSupported } from '@/shared/provider'
import type { GetProviderUsageParams, ProviderUsageQuota, ProviderUsageWindow } from '@/shared/rpc'

/**
 * Provider quota queries adapted from cc-switch's balance / coding-plan services.
 * Supported providers are detected by baseURL substring:
 * - Kimi For Coding: GET /coding/v1/usages (limits[] detail + usage)
 * - Zhipu GLM (cn/en): GET /api/monitor/usage/quota/limit (Authorization without Bearer)
 * - MiniMax (cn/en): GET /v1/api/openplatform/coding_plan/remains (remaining percent)
 * - DeepSeek: GET /user/balance (CNY balance)
 * - SiliconFlow (cn/en): GET /v1/user/info (totalBalance)
 * - OpenRouter: GET /api/v1/credits (total_credits - total_usage)
 * Volcengine and the remaining presets are intentionally not covered: the former
 * needs AK/SK signing, the latter have no public quota endpoint.
 *
 * Error semantics (mirrors cc-switch): transient transport failures (DNS,
 * timeout, aborted body) throw so the caller can retry; deterministic failures
 * (bad key, unknown provider, non-2xx, invalid JSON) resolve with
 * success: false and an error message.
 */

const REQUEST_TIMEOUT_MS = 15_000

const FIVE_HOUR = 'fiveHour'
const WEEKLY = 'weekly'
const BALANCE = 'balance'

function emptyQuota(): ProviderUsageQuota {
  return { success: false, windows: [], queriedAt: Date.now() }
}

function failedQuota(error: string): ProviderUsageQuota {
  return { ...emptyQuota(), error }
}

function successQuota(windows: ProviderUsageWindow[], planLabel?: string): ProviderUsageQuota {
  return { success: true, windows, ...(planLabel ? { planLabel } : {}), queriedAt: Date.now() }
}

/** Parse a JSON field as number, accepting numeric strings like `"100"`. */
function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/** Convert a reset timestamp (ISO string, seconds or milliseconds epoch) to ISO 8601. */
function parseResetTime(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value
  const epoch = parseNumber(value)
  if (epoch === null || epoch <= 0) return null
  const ms = epoch < 1e12 ? epoch * 1000 : epoch
  return new Date(ms).toISOString()
}

/** Percentage used given a total and remaining amount; total defaults like cc-switch. */
function utilization(total: number | null, remaining: number | null): number {
  const totalValue = total ?? 1
  if (totalValue <= 0) return 0
  return Math.max(0, ((totalValue - (remaining ?? 0)) / totalValue) * 100)
}

/** Discriminated outcome of fetching one quota endpoint. */
type QuotaFetchResult =
  { kind: 'body'; body: Record<string, unknown> } | { kind: 'failed'; quota: ProviderUsageQuota }

/**
 * Fetch a quota endpoint. Transport failures throw; HTTP and auth failures
 * resolve to a failed result (401/403 get a dedicated message so the UI can
 * point at the saved token). The optional callback maps provider business
 * errors to a failure message.
 */
async function fetchQuotaJson(
  url: string,
  headers: Record<string, string>,
  onBusinessError?: (body: Record<string, unknown>) => string | null,
): Promise<QuotaFetchResult> {
  let response: Response
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch {
    throw new Error('Network unreachable')
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: 'failed', quota: failedQuota(`Authentication failed (HTTP ${response.status})`) }
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    return {
      kind: 'failed',
      quota: failedQuota(`API error (HTTP ${response.status}): ${body.slice(0, 200)}`),
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { kind: 'failed', quota: failedQuota('Failed to parse response') }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { kind: 'failed', quota: failedQuota('Unexpected response shape') }
  }

  if (onBusinessError) {
    const message = onBusinessError(body as Record<string, unknown>)
    if (message) return { kind: 'failed', quota: failedQuota(message) }
  }
  return { kind: 'body', body: body as Record<string, unknown> }
}

function jsonHeaders(authToken: string, bearer = true): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (bearer) headers.Authorization = `Bearer ${authToken}`
  return headers
}

// ── Kimi For Coding ─────────────────────────────────────────

function parseKimiQuota(body: Record<string, unknown>): ProviderUsageWindow[] {
  const windows: ProviderUsageWindow[] = []
  const limits = body.limits
  if (Array.isArray(limits)) {
    for (const limit of limits) {
      const detail = (limit as Record<string, unknown>)?.detail as Record<string, unknown> | null
      if (!detail) continue
      windows.push({
        name: FIVE_HOUR,
        utilization: utilization(parseNumber(detail.limit), parseNumber(detail.remaining)),
        resetsAt: parseResetTime(detail.resetTime),
      })
      break
    }
  }
  const usage = body.usage as Record<string, unknown> | null
  if (usage) {
    windows.push({
      name: WEEKLY,
      utilization: utilization(parseNumber(usage.limit), parseNumber(usage.remaining)),
      resetsAt: parseResetTime(usage.resetTime),
    })
  }
  return windows
}

async function queryKimi(_baseURL: string, authToken: string): Promise<ProviderUsageQuota> {
  const result = await fetchQuotaJson('https://api.kimi.com/coding/v1/usages', {
    ...jsonHeaders(authToken),
    'Content-Type': 'application/json',
  })
  if (result.kind === 'failed') return result.quota
  return successQuota(parseKimiQuota(result.body))
}

// ── Zhipu GLM ───────────────────────────────────────────────

/**
 * Classify a Zhipu TOKENS_LIMIT entry by its explicit `unit` field:
 * unit 3 → five-hour window, unit 6 → weekly window (both observed shapes).
 * Entries without a recognizable unit fall back to reset-time ordering
 * (no reset first, then ascending) into the still-empty slots.
 */
function parseZhipuQuota(body: Record<string, unknown>): ProviderUsageQuota {
  const data = body.data as Record<string, unknown> | null
  if (!data) return failedQuota("Missing 'data' field in response")

  type Entry = { resetMs: number | null; utilization: number; resetsAt: string | null }
  let fiveHour: Entry | null = null
  let weekly: Entry | null = null
  const unclassified: Entry[] = []

  const limits = data.limits
  if (Array.isArray(limits)) {
    for (const limit of limits) {
      const item = limit as Record<string, unknown>
      const type = typeof item.type === 'string' ? item.type.toUpperCase() : ''
      if (type !== 'TOKENS_LIMIT' && type !== 'CREDIT_LIMIT') continue
      const entry: Entry = {
        resetMs: parseNumber(item.nextResetTime),
        utilization: parseNumber(item.percentage) ?? 0,
        resetsAt: parseResetTime(item.nextResetTime),
      }
      const unit = parseNumber(item.unit)
      if (unit === 3 && !fiveHour) fiveHour = entry
      else if (unit === 6 && !weekly) weekly = entry
      else unclassified.push(entry)
    }
  }

  unclassified.sort((a, b) => {
    if (a.resetMs === null && b.resetMs === null) return 0
    if (a.resetMs === null) return -1
    if (b.resetMs === null) return 1
    return a.resetMs - b.resetMs
  })
  for (const entry of unclassified) {
    if (!fiveHour) fiveHour = entry
    else if (!weekly) weekly = entry
  }

  const windows: ProviderUsageWindow[] = []
  for (const [name, slot] of [
    [FIVE_HOUR, fiveHour],
    [WEEKLY, weekly],
  ] as const) {
    if (slot) windows.push({ name, utilization: slot.utilization, resetsAt: slot.resetsAt })
  }
  const planLabel = typeof data.level === 'string' ? data.level : undefined
  return successQuota(windows, planLabel)
}

/** The quota endpoint lives on the same host as the user's coding endpoint. */
function zhipuQuotaBase(baseURL: string): string {
  return baseURL.toLowerCase().includes('bigmodel.cn')
    ? 'https://open.bigmodel.cn'
    : 'https://api.z.ai'
}

async function queryZhipu(baseURL: string, authToken: string): Promise<ProviderUsageQuota> {
  const url = `${zhipuQuotaBase(baseURL)}/api/monitor/usage/quota/limit`
  // Zhipu rejects the Bearer prefix; the raw key goes in Authorization.
  const result = await fetchQuotaJson(
    url,
    { Authorization: authToken, 'Content-Type': 'application/json', Accept: 'application/json' },
    (body) =>
      body.success === false ? (typeof body.msg === 'string' && body.msg) || 'Unknown error' : null,
  )
  if (result.kind === 'failed') return result.quota
  return parseZhipuQuota(result.body)
}

// ── MiniMax ─────────────────────────────────────────────────

/**
 * The remains endpoint reports remaining percent directly; only the
 * `model_name === "general"` entry is the coding plan (others are video etc.).
 * The weekly bucket is only active when current_weekly_status is 1; plans
 * without one report 3 with a constant 100% remaining.
 */
function parseMinimaxQuota(body: Record<string, unknown>): ProviderUsageWindow[] {
  const windows: ProviderUsageWindow[] = []
  const modelRemains = body.model_remains
  if (!Array.isArray(modelRemains)) return windows
  const item = modelRemains.find(
    (entry) => (entry as Record<string, unknown>)?.model_name === 'general',
  ) as Record<string, unknown> | undefined
  if (!item) return windows

  const intervalRemaining = parseNumber(item.current_interval_remaining_percent)
  if (intervalRemaining !== null) {
    windows.push({
      name: FIVE_HOUR,
      utilization: 100 - intervalRemaining,
      resetsAt: parseResetTime(item.end_time),
    })
  }
  if (item.current_weekly_status === 1) {
    const weeklyRemaining = parseNumber(item.current_weekly_remaining_percent)
    if (weeklyRemaining !== null) {
      windows.push({
        name: WEEKLY,
        utilization: 100 - weeklyRemaining,
        resetsAt: parseResetTime(item.weekly_end_time),
      })
    }
  }
  return windows
}

async function queryMinimax(baseURL: string, authToken: string): Promise<ProviderUsageQuota> {
  const host = baseURL.toLowerCase().includes('api.minimax.io')
    ? 'api.minimax.io'
    : 'api.minimaxi.com'
  const result = await fetchQuotaJson(
    `https://${host}/v1/api/openplatform/coding_plan/remains`,
    { ...jsonHeaders(authToken), 'Content-Type': 'application/json' },
    (body) => {
      const baseResp = body.base_resp as Record<string, unknown> | null
      const statusCode = baseResp ? (parseNumber(baseResp.status_code) ?? -1) : 0
      if (statusCode !== 0) {
        const message =
          typeof baseResp?.status_msg === 'string' ? baseResp.status_msg : 'Unknown error'
        return `API error (code ${statusCode}): ${message}`
      }
      return null
    },
  )
  if (result.kind === 'failed') return result.quota
  return successQuota(parseMinimaxQuota(result.body))
}

// ── Balance providers (DeepSeek / SiliconFlow / OpenRouter) ─

function balanceQuota(
  remaining: number,
  unit: string,
  isValid: boolean,
  invalidMessage: string,
): ProviderUsageQuota {
  // A balance has no percentage window; utilization 100 marks an exhausted one.
  const window: ProviderUsageWindow = {
    name: BALANCE,
    remaining,
    unit,
    utilization: isValid ? 0 : 100,
    resetsAt: null,
  }
  const quota = successQuota([window])
  if (!isValid) quota.error = invalidMessage
  return quota
}

async function queryDeepSeek(_baseURL: string, authToken: string): Promise<ProviderUsageQuota> {
  const result = await fetchQuotaJson(
    'https://api.deepseek.com/user/balance',
    jsonHeaders(authToken),
  )
  if (result.kind === 'failed') return result.quota

  const infos = result.body.balance_infos
  if (!Array.isArray(infos) || infos.length === 0) return failedQuota('No balance info in response')
  const info = infos[0] as Record<string, unknown>
  const currency = typeof info.currency === 'string' ? info.currency : 'CNY'
  const total = parseNumber(info.total_balance) ?? 0
  // is_available sits at the response top level, next to balance_infos.
  const isAvailable = result.body.is_available !== false
  return balanceQuota(total, currency, isAvailable, 'Insufficient balance')
}

async function querySiliconFlow(baseURL: string, authToken: string): Promise<ProviderUsageQuota> {
  const host = baseURL.toLowerCase().includes('api.siliconflow.com')
    ? 'api.siliconflow.com'
    : 'api.siliconflow.cn'
  const result = await fetchQuotaJson(`https://${host}/v1/user/info`, jsonHeaders(authToken))
  if (result.kind === 'failed') return result.quota

  const data = result.body.data as Record<string, unknown> | null
  if (!data) return failedQuota("Missing 'data' field in response")
  const unit = host === 'api.siliconflow.cn' ? 'CNY' : 'USD'
  return balanceQuota(parseNumber(data.totalBalance) ?? 0, unit, true, '')
}

async function queryOpenRouter(_baseURL: string, authToken: string): Promise<ProviderUsageQuota> {
  const result = await fetchQuotaJson(
    'https://openrouter.ai/api/v1/credits',
    jsonHeaders(authToken),
  )
  if (result.kind === 'failed') return result.quota

  const data = (result.body.data as Record<string, unknown> | null) ?? result.body
  const totalCredits = parseNumber(data.total_credits) ?? 0
  const totalUsage = parseNumber(data.total_usage) ?? 0
  const remaining = totalCredits - totalUsage
  return balanceQuota(remaining, 'USD', remaining > 0, 'No credits remaining')
}

// ── Detection & entry point ─────────────────────────────────

type UsageQuery = (baseURL: string, authToken: string) => Promise<ProviderUsageQuota>

function detectProvider(baseURL: string): UsageQuery | null {
  const url = baseURL.toLowerCase()
  if (url.includes('api.kimi.com/coding')) return queryKimi
  if (url.includes('bigmodel.cn')) return queryZhipu
  if (url.includes('api.z.ai')) return queryZhipu
  if (url.includes('api.minimaxi.com') || url.includes('api.minimax.io')) return queryMinimax
  if (url.includes('api.deepseek.com')) return queryDeepSeek
  if (url.includes('api.siliconflow.cn') || url.includes('api.siliconflow.com'))
    return querySiliconFlow
  if (url.includes('openrouter.ai')) return queryOpenRouter
  return null
}

export async function getProviderUsage({
  baseURL,
  authToken,
}: GetProviderUsageParams): Promise<ProviderUsageQuota> {
  if (authToken.trim() === '') return failedQuota('API key is empty')

  if (!isProviderUsageSupported(baseURL)) return failedQuota('Unsupported provider for quota query')

  const query = detectProvider(baseURL)
  if (!query) return failedQuota('Unsupported provider for quota query')

  try {
    return await query(baseURL, authToken)
  } catch (caught) {
    throw caught instanceof Error ? caught : new Error(String(caught))
  }
}
