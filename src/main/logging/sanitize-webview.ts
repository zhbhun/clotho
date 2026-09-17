import type { AppLogLevel, JsonValue, WebviewLogEntry } from '@/shared/logging'

import { type SanitizeLogOptions, isPlainObject, safeErrorName } from './sanitize-context'
import { serializeLogError } from './sanitize-error'

export type SanitizeWebviewLogOptions = SanitizeLogOptions & {
  maxBatchSize?: number
}

type WebviewEventPolicy = Pick<WebviewLogEntry, 'level' | 'logger' | 'message'> & {
  sanitizeContext?: (context: Record<string, unknown>) => Record<string, JsonValue>
  hasError?: boolean
}

const DEFAULT_MAX_BATCH_SIZE = 50
const LOG_LEVELS = new Set<AppLogLevel>(['debug', 'error', 'fatal', 'info', 'warning'])
const WEBVIEW_LOGGER_PATTERN = /^clotho\.webview(?:\.[a-z][a-z0-9_-]*)*$/
const EVENT_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/

const WEBVIEW_EVENT_POLICIES: Record<string, WebviewEventPolicy> = {
  'logging.records_dropped': {
    level: 'warning',
    logger: 'clotho.webview.logging',
    message: 'Webview log records were dropped',
    sanitizeContext: (context) =>
      compactContext({ count: boundedInteger(context.count, 1, 1_000_000) }),
  },
  'persistence.flush_failed': {
    level: 'warning',
    logger: 'clotho.webview.persistence',
    message: 'Webview persistence failed to flush',
    sanitizeContext: (context) =>
      compactContext({
        errorName: safeErrorName(context.errorName),
        target: enumValue(context.target, ['sessions', 'settings']),
      }),
  },
  'render.failed': {
    level: 'error',
    logger: 'clotho.webview.render',
    message: 'Webview rendering failed',
    sanitizeContext: (context) =>
      compactContext({ boundary: enumValue(context.boundary, ['agent-reply', 'application']) }),
    hasError: true,
  },
  'query.stream_failed': {
    level: 'error',
    logger: 'clotho.webview.query',
    message: 'Claude query stream failed',
    sanitizeContext: (context) =>
      compactContext({
        phase: enumValue(context.phase, [
          'idle',
          'awaiting-history',
          'recall-requested',
          'persisted',
          'stop-requested',
        ]),
      }),
    hasError: true,
  },
  'shortcut.failed': {
    level: 'error',
    logger: 'clotho.webview.shortcut',
    message: 'A shortcut command failed',
    hasError: true,
  },
  'webview.started': {
    level: 'info',
    logger: 'clotho.webview.app',
    message: 'Clotho webview started',
  },
  'webview.startup_failed': {
    level: 'error',
    logger: 'clotho.webview.app',
    message: 'Clotho webview failed to start',
    hasError: true,
  },
  'webview.unhandled_error': {
    level: 'error',
    logger: 'clotho.webview.app',
    message: 'An unhandled webview error occurred',
    sanitizeContext: (context) =>
      compactContext({
        column: boundedInteger(context.column, 0, 10_000_000),
        line: boundedInteger(context.line, 0, 10_000_000),
      }),
    hasError: true,
  },
  'webview.unhandled_rejection': {
    level: 'error',
    logger: 'clotho.webview.app',
    message: 'An unhandled webview rejection occurred',
    hasError: true,
  },
}

export function sanitizeWebviewLogBatch(
  value: unknown,
  options: SanitizeWebviewLogOptions,
): { dropped: number; entries: WebviewLogEntry[] } {
  if (!Array.isArray(value)) return { dropped: 1, entries: [] }

  const maxBatchSize = options.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE
  const entries: WebviewLogEntry[] = []
  let dropped = Math.max(0, value.length - maxBatchSize)

  for (const candidate of value.slice(0, maxBatchSize)) {
    if (!isPlainObject(candidate)) {
      dropped += 1
      continue
    }
    const { context, error, event, level, logger, message } = candidate
    const policy = typeof event === 'string' ? WEBVIEW_EVENT_POLICIES[event] : undefined
    if (
      !isLogLevel(level) ||
      typeof logger !== 'string' ||
      !WEBVIEW_LOGGER_PATTERN.test(logger) ||
      typeof event !== 'string' ||
      !EVENT_PATTERN.test(event) ||
      !policy ||
      typeof message !== 'string' ||
      message.length === 0
    ) {
      dropped += 1
      continue
    }

    const entry: WebviewLogEntry = {
      level: policy.level,
      logger: policy.logger,
      event,
      message: policy.message,
    }
    if (isPlainObject(context) && policy.sanitizeContext) {
      const sanitized = policy.sanitizeContext(context)
      if (Object.keys(sanitized).length > 0) entry.context = sanitized
    }
    if (policy.hasError && error !== undefined) entry.error = serializeLogError(error, options)
    entries.push(entry)
  }

  return { dropped, entries }
}

function isLogLevel(value: unknown): value is AppLogLevel {
  return typeof value === 'string' && LOG_LEVELS.has(value as AppLogLevel)
}

function boundedInteger(value: unknown, minimum: number, maximum: number) {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum
    ? Number(value)
    : undefined
}

function enumValue(value: unknown, allowed: readonly string[]) {
  return typeof value === 'string' && allowed.includes(value) ? value : undefined
}

function compactContext(context: Record<string, JsonValue | undefined>): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(context).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined),
  )
}
