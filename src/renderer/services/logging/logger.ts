import type { AppLogLevel, JsonValue, SerializedLogError, WebviewLogEntry } from '@/shared/logging'

type WebviewLoggerOptions = {
  flushIntervalMs?: number
  maxBatchSize?: number
  maxQueueSize?: number
  onSendError?: (caught: unknown) => void
  sendBatch: (entries: WebviewLogEntry[]) => void
}

type ErrorLogDetails = {
  componentStack?: string
  context?: Record<string, JsonValue>
  error: unknown
}

function serializeError(
  caught: unknown,
  componentStack?: string,
  seen = new WeakSet<object>(),
  depth = 0,
): SerializedLogError {
  if (!caught || typeof caught !== 'object') {
    return { name: 'Error', message: String(caught), ...(componentStack ? { componentStack } : {}) }
  }
  if (seen.has(caught)) return { name: 'Error', message: '[Circular cause]' }
  seen.add(caught)

  const candidate = caught as Record<string, unknown>
  const error: SerializedLogError = {
    name: typeof candidate.name === 'string' ? candidate.name : 'Error',
    message: typeof candidate.message === 'string' ? candidate.message : String(caught),
    ...(componentStack ? { componentStack } : {}),
  }
  if (typeof candidate.code === 'string' || typeof candidate.code === 'number') {
    error.code = String(candidate.code)
  }
  if (typeof candidate.stack === 'string') error.stack = candidate.stack
  if (candidate.cause !== undefined && depth < 3) {
    error.cause = serializeError(candidate.cause, undefined, seen, depth + 1)
  }
  return error
}

export function createWebviewLogger(_options: WebviewLoggerOptions) {
  const options = {
    flushIntervalMs: 500,
    maxBatchSize: 50,
    maxQueueSize: 200,
    onSendError: () => undefined,
    ..._options,
  }
  const queue: WebviewLogEntry[] = []
  let timer: ReturnType<typeof setTimeout> | undefined
  let dropped = 0

  const schedule = () => {
    timer ??= setTimeout(flush, options.flushIntervalMs)
  }

  const flush = () => {
    if (timer) clearTimeout(timer)
    timer = undefined
    if (queue.length === 0 && dropped === 0) return

    const notice: WebviewLogEntry[] = dropped
      ? [
          {
            level: 'warning',
            logger: 'clotho.webview.logging',
            event: 'logging.records_dropped',
            message: 'Webview log records were dropped',
            context: { count: dropped },
          },
        ]
      : []
    const queuedCount = Math.max(0, options.maxBatchSize - notice.length)
    const entries = [...notice, ...queue.slice(0, queuedCount)]
    try {
      options.sendBatch(entries)
    } catch (caught) {
      try {
        options.onSendError(caught)
      } catch {
        // Reporting a logging transport failure must remain contained.
      }
      schedule()
      return
    }

    queue.splice(0, queuedCount)
    dropped = 0
    if (queue.length > 0) schedule()
  }

  const enqueue = (entry: WebviewLogEntry, immediate = false) => {
    if (immediate) queue.unshift(entry)
    else queue.push(entry)
    while (queue.length > options.maxQueueSize) {
      const lowPriorityIndex = queue.findIndex(
        (candidate) => candidate.level === 'debug' || candidate.level === 'info',
      )
      const removalIndex =
        lowPriorityIndex >= 0 ? lowPriorityIndex : immediate ? queue.length - 1 : 0
      queue.splice(removalIndex, 1)
      dropped += 1
    }
    if (immediate || queue.length >= options.maxBatchSize) {
      flush()
      return
    }
    schedule()
  }

  return {
    flush,
    getLogger(category: string) {
      const log = (
        level: AppLogLevel,
        event: string,
        message: string,
        context?: Record<string, JsonValue>,
        error?: SerializedLogError,
      ) => {
        enqueue(
          {
            level,
            logger: `clotho.webview.${category}`,
            event,
            message,
            ...(context ? { context } : {}),
            ...(error ? { error } : {}),
          },
          level === 'error' || level === 'fatal',
        )
      }
      const safely = (write: () => void) => {
        try {
          write()
        } catch {
          // Logging must never change the outcome of application code.
        }
      }
      return {
        debug(event: string, message: string, context?: Record<string, JsonValue>) {
          safely(() => log('debug', event, message, context))
        },
        error(event: string, message: string, details: ErrorLogDetails) {
          safely(() =>
            log(
              'error',
              event,
              message,
              details.context,
              serializeError(details.error, details.componentStack),
            ),
          )
        },
        fatal(event: string, message: string, details: ErrorLogDetails) {
          safely(() =>
            log(
              'fatal',
              event,
              message,
              details.context,
              serializeError(details.error, details.componentStack),
            ),
          )
        },
        info(event: string, message: string, context?: Record<string, JsonValue>) {
          safely(() => log('info', event, message, context))
        },
        warning(event: string, message: string, context?: Record<string, JsonValue>) {
          safely(() => log('warning', event, message, context))
        },
      }
    },
  }
}
