import type { SerializedLogError } from '@/shared/logging'

import {
  type CompleteSanitizeLogOptions,
  type SanitizeLogOptions,
  completeOptions,
  safeErrorName,
  sanitizeString,
} from './sanitize-context'

const OMITTED_ERROR_MESSAGE = 'Error details omitted'
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
const SAFE_ERROR_CODES = new Set([
  'EACCES',
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EEXIST',
  'EHOSTUNREACH',
  'EIO',
  'EISDIR',
  'EMFILE',
  'ENETUNREACH',
  'ENFILE',
  'ENOENT',
  'ENOMEM',
  'ENOSPC',
  'ENOTDIR',
  'ENOTEMPTY',
  'EPERM',
  'EPIPE',
  'EROFS',
  'ETIMEDOUT',
])

export function serializeLogError(
  caught: unknown,
  options: SanitizeLogOptions,
): SerializedLogError {
  return serializeError(caught, completeOptions(options), new WeakSet(), 0)
}

function errorField(value: unknown, field: string) {
  if (!value || typeof value !== 'object') return undefined
  return (value as Record<string, unknown>)[field]
}

function serializeError(
  caught: unknown,
  options: CompleteSanitizeLogOptions,
  seen: WeakSet<object>,
  causeDepth: number,
): SerializedLogError {
  if (!caught || typeof caught !== 'object') {
    return {
      name: 'Error',
      message: OMITTED_ERROR_MESSAGE,
    }
  }
  if (seen.has(caught)) return { name: 'Error', message: '[Circular cause]' }
  seen.add(caught)

  const rawName = errorField(caught, 'name')
  const rawCode = errorField(caught, 'code')
  const rawMessage = errorField(caught, 'message')
  const rawStack = errorField(caught, 'stack')
  const rawComponentStack = errorField(caught, 'componentStack')
  const rawCause = errorField(caught, 'cause')
  const error: SerializedLogError = {
    name: safeErrorName(rawName) ?? 'Error',
    message: safeErrorMessage(rawMessage, options),
  }

  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode) : ''
  if (SAFE_ERROR_CODES.has(code)) error.code = code
  if (typeof rawStack === 'string') error.stack = sanitizeStackFrames(rawStack, options)
  if (typeof rawComponentStack === 'string') {
    error.componentStack = sanitizeStackFrames(rawComponentStack, options)
  }
  if (rawCause !== undefined && causeDepth < options.maxCauseDepth) {
    error.cause = serializeError(rawCause, options, seen, causeDepth + 1)
  }
  return error
}

function safeErrorMessage(value: unknown, options: CompleteSanitizeLogOptions) {
  if (
    typeof value !== 'string' ||
    !SAFE_ERROR_MESSAGE_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    return OMITTED_ERROR_MESSAGE
  }
  return sanitizeString(value, options, 500)
}

function sanitizeStackFrames(value: string, options: CompleteSanitizeLogOptions) {
  const frames = value
    .split(/\r?\n/)
    .filter((line) => /^\s*at\s/.test(line))
    .map((line) => {
      let sanitized = options.homeDir ? line.replaceAll(options.homeDir, '$HOME') : line
      sanitized = sanitized.replace(
        /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(\/[^)\s]+)/g,
        '$WEBVIEW$1',
      )
      sanitized = sanitized.replace(
        /(^|[\s(])(?:file:\/\/)?\/(?!\/)[^)\s]+/g,
        (_match, prefix: string) => `${prefix}$PATH`,
      )
      sanitized = sanitized.replace(
        /(^|[\s(])[A-Za-z]:\\[^)\s]+/g,
        (_match, prefix: string) => `${prefix}$PATH`,
      )
      const frameName = sanitized.match(/^\s*at\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)/)?.[1]
      const location = sanitized.match(
        /\$HOME[^)\s]*|\$PATH|\$WEBVIEW[^)\s]*|node:[^)\s]+/,
      )?.[0]
      return `    at ${frameName ?? '<unknown>'}${location ? ` (${location})` : ''}`
    })
  if (frames.length === 0) return undefined
  return sanitizeString(`\n${frames.join('\n')}`, options, options.maxStackLength)
}
