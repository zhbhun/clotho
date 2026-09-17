import type { AppLogChannel, AppLogLevel, JsonValue, SerializedLogError } from '@/shared/logging'

import { sanitizeLogContext, sanitizeWebviewLogBatch, serializeLogError } from './sanitize'

export type AppLogProperties = {
  schemaVersion: 1
  event: string
  process: 'main' | 'webview'
  runId: string
  appVersion: string
  channel: AppLogChannel
  context?: Record<string, JsonValue>
  error?: SerializedLogError
}

export type AppLogRecord = {
  level: AppLogLevel
  logger: string
  message: string
  properties: AppLogProperties
}

type AppLoggerOptions = {
  appVersion: string
  channel: AppLogChannel
  homeDir: string
  runId: string
  write: (record: AppLogRecord) => void
}

type ErrorLogDetails = {
  context?: Record<string, unknown>
  error: unknown
}

export function createAppLogger(options: AppLoggerOptions) {
  const sanitizeOptions = { homeDir: options.homeDir }
  const write = (
    process: 'main' | 'webview',
    level: AppLogLevel,
    logger: string,
    event: string,
    message: string,
    context?: unknown,
    error?: unknown,
  ) => {
    try {
      const sanitizedMessage = sanitizeLogContext({ message }, sanitizeOptions).message
      const properties: AppLogProperties = {
        schemaVersion: 1,
        event,
        process,
        runId: options.runId,
        appVersion: options.appVersion,
        channel: options.channel,
      }
      if (context !== undefined) {
        properties.context = sanitizeLogContext(context, sanitizeOptions) as Record<
          string,
          JsonValue
        >
      }
      if (error !== undefined) properties.error = serializeLogError(error, sanitizeOptions)
      options.write({
        level,
        logger,
        message: typeof sanitizedMessage === 'string' ? sanitizedMessage : 'Log event',
        properties,
      })
    } catch {
      // Logging must never change the outcome of application code.
    }
  }

  return {
    getLogger(category: string) {
      const logger = `clotho.${category}`
      return {
        debug(event: string, message: string, context?: Record<string, unknown>) {
          write('main', 'debug', logger, event, message, context)
        },
        error(event: string, message: string, details: ErrorLogDetails) {
          write('main', 'error', logger, event, message, details.context, details.error)
        },
        fatal(event: string, message: string, details: ErrorLogDetails) {
          write('main', 'fatal', logger, event, message, details.context, details.error)
        },
        info(event: string, message: string, context?: Record<string, unknown>) {
          write('main', 'info', logger, event, message, context)
        },
        warning(event: string, message: string, context?: Record<string, unknown>) {
          write('main', 'warning', logger, event, message, context)
        },
      }
    },
    recordWebviewBatch(payload: unknown) {
      try {
        const entriesValue =
          payload && typeof payload === 'object' && !Array.isArray(payload)
            ? (payload as Record<string, unknown>).entries
            : undefined
        const { dropped, entries } = sanitizeWebviewLogBatch(entriesValue, sanitizeOptions)
        for (const entry of entries) {
          write(
            'webview',
            entry.level,
            entry.logger,
            entry.event,
            entry.message,
            entry.context,
            entry.error,
          )
        }
        if (dropped > 0) {
          write(
            'main',
            'warning',
            'clotho.rpc',
            'rpc.invalid_log_batch',
            'Invalid webview log records were dropped',
            { dropped },
          )
        }
      } catch {
        write(
          'main',
          'warning',
          'clotho.rpc',
          'rpc.invalid_log_batch',
          'An invalid webview log batch was dropped',
        )
      }
    },
  }
}
