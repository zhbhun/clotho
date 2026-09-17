export type AppLogLevel = 'debug' | 'error' | 'fatal' | 'info' | 'warning'
export type AppLogChannel = 'canary' | 'dev' | 'stable'

export type JsonPrimitive = boolean | null | number | string
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type SerializedLogError = {
  name: string
  message: string
  code?: string
  stack?: string
  componentStack?: string
  cause?: SerializedLogError
}

export type WebviewLogEntry = {
  level: AppLogLevel
  logger: string
  event: string
  message: string
  context?: Record<string, JsonValue>
  error?: SerializedLogError
}

export type WebviewLogBatch = {
  entries: WebviewLogEntry[]
}
