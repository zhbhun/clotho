export type SanitizeLogOptions = {
  homeDir: string
  maxCauseDepth?: number
  maxDepth?: number
  maxProperties?: number
  maxStackLength?: number
  maxStringLength?: number
}

export type CompleteSanitizeLogOptions = Required<SanitizeLogOptions>

type SanitizeState = {
  remainingProperties: number
  seen: WeakSet<object>
}

const DEFAULT_MAX_DEPTH = 5
const DEFAULT_MAX_CAUSE_DEPTH = 3
const DEFAULT_MAX_PROPERTIES = 100
const DEFAULT_MAX_STACK_LENGTH = 12_000
const DEFAULT_MAX_STRING_LENGTH = 2_000

const SAFE_ERROR_NAMES = new Set([
  'AbortError',
  'AggregateError',
  'DOMException',
  'Error',
  'EvalError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'SystemError',
  'TypeError',
  'URIError',
])

const SENSITIVE_FIELDS = new Set([
  'apikey',
  'authorization',
  'content',
  'model',
  'modelid',
  'password',
  'prompt',
  'secret',
  'token',
  'toolinput',
  'tooloutput',
])

const SENSITIVE_FIELD_FRAGMENTS = [
  'apikey',
  'authorization',
  'content',
  'credential',
  'model',
  'password',
  'privatekey',
  'prompt',
  'secret',
  'token',
  'toolinput',
  'tooloutput',
]

export function sanitizeLogContext(
  value: unknown,
  options: SanitizeLogOptions,
): Record<string, unknown> {
  const completed = completeOptions(options)
  const sanitized = sanitizeValue(
    value,
    completed,
    { remainingProperties: completed.maxProperties, seen: new WeakSet() },
    0,
  )
  return isPlainObject(sanitized) ? sanitized : {}
}

export function completeOptions(options: SanitizeLogOptions): CompleteSanitizeLogOptions {
  return {
    homeDir: options.homeDir,
    maxCauseDepth: options.maxCauseDepth ?? DEFAULT_MAX_CAUSE_DEPTH,
    maxDepth: options.maxDepth ?? DEFAULT_MAX_DEPTH,
    maxProperties: options.maxProperties ?? DEFAULT_MAX_PROPERTIES,
    maxStackLength: options.maxStackLength ?? DEFAULT_MAX_STACK_LENGTH,
    maxStringLength: options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH,
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function safeErrorName(value: unknown) {
  return typeof value === 'string' && SAFE_ERROR_NAMES.has(value) ? value : undefined
}

export function sanitizeString(
  value: string,
  options: CompleteSanitizeLogOptions,
  maxLength = options.maxStringLength,
) {
  let normalized = replaceHomePaths(value, options.homeDir)
  normalized = normalized.replace(
    /(^|[\s("'=])\\\\[^)"'\r\n]+/g,
    (_match, prefix: string) => `${prefix}$PATH`,
  )
  normalized = normalized.replace(
    /(^|[\s("'=])\/\/[^)"'\r\n]+/g,
    (_match, prefix: string) => `${prefix}$PATH`,
  )
  normalized = normalized.replace(
    /(^|[\s("'=])\/(?!\/)[^)"'\r\n]+/g,
    (_match, prefix: string) => `${prefix}$PATH`,
  )
  normalized = normalized.replace(
    /(^|[\s("'=])[A-Za-z]:[\\/][^)"'\r\n]+/g,
    (_match, prefix: string) => `${prefix}$PATH`,
  )
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}…` : normalized
}

function replaceHomePaths(value: string, homeDir: string) {
  const normalizedHome = homeDir.replace(/[\\/]+$/, '')
  if (!normalizedHome) return value
  const escapedHome = normalizedHome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const flags = /^[A-Za-z]:[\\/]/.test(normalizedHome) ? 'gi' : 'g'
  const homePattern = new RegExp(`(^|[\\s("'=])${escapedHome}(?=$|[\\\\/])`, flags)
  return value.replace(homePattern, (_match, prefix: string) => `${prefix}$HOME`)
}

function normalizeField(field: string) {
  return field.replaceAll(/[-_]/g, '').toLowerCase()
}

function isSensitiveField(field: string) {
  const normalized = normalizeField(field)
  return (
    SENSITIVE_FIELDS.has(normalized) ||
    SENSITIVE_FIELD_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  )
}

function sanitizeValue(
  value: unknown,
  options: CompleteSanitizeLogOptions,
  state: SanitizeState,
  depth: number,
): unknown {
  if (typeof value === 'string') return sanitizeString(value, options)
  if (
    value === null ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value
  }
  if (typeof value === 'bigint') return value.toString()
  if (!value || typeof value !== 'object') return undefined
  if (state.seen.has(value)) return '[Circular]'
  if (depth >= options.maxDepth) return '[Truncated]'
  state.seen.add(value)

  if (Array.isArray(value)) {
    const items: unknown[] = []
    for (const item of value) {
      if (state.remainingProperties <= 0) break
      state.remainingProperties -= 1
      items.push(sanitizeValue(item, options, state, depth + 1) ?? null)
    }
    return items
  }
  if (!isPlainObject(value)) return `[${value.constructor?.name ?? 'Object'}]`

  const entries: Array<[string, unknown]> = []
  for (const [field, item] of Object.entries(value)) {
    if (isSensitiveField(field)) continue
    if (state.remainingProperties <= 0) break
    state.remainingProperties -= 1
    if (normalizeField(field) === 'errorname') {
      const name = safeErrorName(item)
      if (name !== undefined) entries.push([field, name])
      continue
    }
    const sanitized = sanitizeValue(item, options, state, depth + 1)
    if (sanitized !== undefined) entries.push([field, sanitized])
  }
  return Object.fromEntries(entries)
}
