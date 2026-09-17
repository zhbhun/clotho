import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getRotatingFileSink } from '@logtape/file'
import {
  type LogLevel,
  type Sink,
  configure,
  dispose,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger as getLogTapeLogger,
} from '@logtape/logtape'
import { redactByField } from '@logtape/redaction'

import type { AppLogChannel, AppLogLevel } from '@/shared/logging'

import { clothoDir } from '../app-data'
import { type AppLogRecord, createAppLogger } from './logger'

const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024
const MAX_LOG_FILES = 5
const DEFAULT_FLUSH_INTERVAL_MS = 1_000
const REDACT_FIELDS = [
  /api[-_]?key/i,
  /authorization/i,
  /content/i,
  /credential/i,
  /model/i,
  /pass(?:code|phrase|word)/i,
  /private[-_]?key/i,
  /prompt/i,
  /secret/i,
  /token/i,
  /tool[-_]?(?:input|output)/i,
]

type AppLogger = ReturnType<typeof createAppLogger>

type InitializeLoggingOptions = {
  appVersion: string
  channel: AppLogChannel
  homeDir: string
  runId: string
}

let activeLogger: AppLogger | undefined
let isConfigured = false
const memoryRecords: unknown[] = []

export function getLoggingDestinations(
  environment: string | undefined,
  channel: AppLogChannel,
): Array<'console' | 'file' | 'memory'> {
  if (environment === 'test') return ['memory']
  return channel === 'dev' ? ['file', 'console'] : ['file']
}

export function getLogFilePath(rootDir: string, channel: AppLogChannel) {
  const logDir =
    channel === 'stable' ? path.join(rootDir, 'logs') : path.join(rootDir, 'logs', channel)
  return path.join(logDir, 'clotho.jsonl')
}

function logLevel(channel: AppLogChannel): LogLevel {
  const override = process.env.CLOTHO_LOG_LEVEL
  if (
    override === 'debug' ||
    override === 'info' ||
    override === 'warning' ||
    override === 'error' ||
    override === 'fatal'
  ) {
    return override
  }
  return channel === 'dev' ? 'debug' : 'info'
}

function writeToLogTape(record: AppLogRecord) {
  const logger = getLogTapeLogger(record.logger.split('.'))
  const properties = record.properties as Record<string, unknown>
  if (record.level === 'warning') logger.warn(record.message, properties)
  else logger[record.level](record.message, properties)
}

async function configureLogTape(channel: AppLogChannel) {
  const filePath = getLogFilePath(clothoDir(), channel)
  await fs.mkdir(path.dirname(filePath), { recursive: true })

  const formatter = getJsonLinesFormatter({ properties: 'nest:properties' })
  const fileSink = redactByField(
    getRotatingFileSink(filePath, {
      bufferSize: 8_192,
      flushInterval: DEFAULT_FLUSH_INTERVAL_MS,
      formatter,
      maxFiles: MAX_LOG_FILES,
      maxSize: MAX_LOG_FILE_SIZE,
      nonBlocking: true,
    }),
    { fieldPatterns: REDACT_FIELDS, maxDepth: 5, maxProperties: 100 },
  ) as Sink

  const sinks: Record<string, Sink> = { file: fileSink }
  const loggerSinks = ['file']
  if (channel === 'dev') {
    sinks.console = redactByField(getConsoleSink(), {
      fieldPatterns: REDACT_FIELDS,
      maxDepth: 5,
      maxProperties: 100,
    }) as Sink
    loggerSinks.push('console')
  }

  await configure({
    reset: true,
    sinks,
    loggers: [
      {
        category: 'clotho',
        lowestLevel: logLevel(channel),
        parentSinks: 'override',
        sinks: loggerSinks,
      },
      {
        category: 'logtape',
        lowestLevel: channel === 'dev' ? 'warning' : null,
        parentSinks: 'override',
        sinks: channel === 'dev' ? ['console'] : [],
      },
    ],
  })
  isConfigured = true
}

async function configureMemoryLogTape(channel: AppLogChannel) {
  memoryRecords.length = 0
  const memorySink: Sink = (record) => {
    if (memoryRecords.length >= 1_000) memoryRecords.shift()
    memoryRecords.push(record)
  }
  await configure({
    reset: true,
    sinks: { memory: memorySink },
    loggers: [
      {
        category: 'clotho',
        lowestLevel: logLevel(channel),
        parentSinks: 'override',
        sinks: ['memory'],
      },
    ],
  })
  isConfigured = true
}

export async function initializeLogging(options: InitializeLoggingOptions) {
  try {
    const [destination] = getLoggingDestinations(process.env.NODE_ENV, options.channel)
    if (destination === 'memory') await configureMemoryLogTape(options.channel)
    else await configureLogTape(options.channel)
  } catch {
    if (process.env.NODE_ENV !== 'test') {
      console.error('Failed to initialize Clotho file logging')
      await configure({
        reset: true,
        sinks: { console: getConsoleSink() },
        loggers: [
          {
            category: ['clotho'],
            lowestLevel: logLevel(options.channel),
            parentSinks: 'override',
            sinks: ['console'],
          },
        ],
      }).catch(() => undefined)
      isConfigured = true
    }
  }

  activeLogger = createAppLogger({ ...options, write: writeToLogTape })
}

export async function shutdownLogging() {
  if (!isConfigured) return
  isConfigured = false
  activeLogger = undefined
  await dispose()
}

export function recordWebviewLogBatch(payload: unknown) {
  activeLogger?.recordWebviewBatch(payload)
}

export function getLogger(category: string) {
  const invoke = (
    level: AppLogLevel,
    event: string,
    message: string,
    details?: Record<string, unknown>,
  ) => {
    const logger = activeLogger?.getLogger(category)
    if (!logger) return
    if (level === 'error' || level === 'fatal') {
      logger[level](event, message, {
        context: details?.context as Record<string, unknown> | undefined,
        error: details?.error,
      })
      return
    }
    logger[level](event, message, details)
  }

  return {
    debug(event: string, message: string, context?: Record<string, unknown>) {
      invoke('debug', event, message, context)
    },
    error(
      event: string,
      message: string,
      details: { context?: Record<string, unknown>; error: unknown },
    ) {
      invoke('error', event, message, details)
    },
    fatal(
      event: string,
      message: string,
      details: { context?: Record<string, unknown>; error: unknown },
    ) {
      invoke('fatal', event, message, details)
    },
    info(event: string, message: string, context?: Record<string, unknown>) {
      invoke('info', event, message, context)
    },
    warning(event: string, message: string, context?: Record<string, unknown>) {
      invoke('warning', event, message, context)
    },
  }
}
