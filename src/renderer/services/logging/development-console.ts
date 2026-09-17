import type { AppLogLevel, WebviewLogEntry } from '@/shared/logging'

type DevelopmentConsolePolicy = {
  hasError?: boolean
  level: AppLogLevel
  message: string
}

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

const SAFE_ERROR_MESSAGE_PATTERNS = [
  /^Maximum update depth exceeded\./,
  /^Too many re-renders\./,
  /^Invalid hook call\./,
  /^Rendered (more|fewer) hooks than during the previous render\./,
  /^Cannot read properties of (?:undefined|null) \(reading '[A-Za-z_$][\w$]*'\)\.?$/,
  /^(?:undefined|null) is not an object \(evaluating '[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*'\)\.?$/,
  /^Cannot destructure property '[A-Za-z_$][\w$]*' of '(?:undefined|null)' as it is undefined\.?$/,
  /^Cannot convert undefined or null to object\.?$/,
  /^\w+(?:\.\w+)* is not a function\.?$/,
  /^\w+(?:\.\w+)* is not iterable\.?$/,
]

function safeErrorMessage(message: string) {
  return SAFE_ERROR_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
    ? message.slice(0, 500)
    : 'Error details omitted'
}

const POLICIES: Record<string, DevelopmentConsolePolicy> = {
  'logging.records_dropped': {
    level: 'warning',
    message: 'Webview log records were dropped',
  },
  'persistence.flush_failed': {
    level: 'warning',
    message: 'Webview persistence failed to flush',
  },
  'render.failed': {
    hasError: true,
    level: 'error',
    message: 'Webview rendering failed',
  },
  'query.stream_failed': {
    hasError: true,
    level: 'error',
    message: 'Claude query stream failed',
  },
  'shortcut.failed': {
    hasError: true,
    level: 'error',
    message: 'A shortcut command failed',
  },
  'webview.started': {
    level: 'info',
    message: 'Clotho webview started',
  },
  'webview.startup_failed': {
    hasError: true,
    level: 'error',
    message: 'Clotho webview failed to start',
  },
  'webview.unhandled_error': {
    hasError: true,
    level: 'error',
    message: 'An unhandled webview error occurred',
  },
  'webview.unhandled_rejection': {
    hasError: true,
    level: 'error',
    message: 'An unhandled webview rejection occurred',
  },
}

export function sanitizeDevelopmentConsoleEntry(entry: WebviewLogEntry) {
  const policy = POLICIES[entry.event]
  if (!policy) return undefined

  const error =
    policy.hasError && entry.error
      ? {
          message: safeErrorMessage(entry.error.message),
          name: SAFE_ERROR_NAMES.has(entry.error.name) ? entry.error.name : 'Error',
        }
      : undefined

  return {
    details: error ? { error } : {},
    level: policy.level,
    message: policy.message,
  }
}
