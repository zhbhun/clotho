import type { WebviewLogEntry } from '@/shared/logging'

import { isDesktopRuntime, sendMessageToDesktop } from '../desktop/client'
import { sanitizeDevelopmentConsoleEntry } from './development-console'
import { createWebviewLogger } from './logger'

function writeDevelopmentConsole(entries: WebviewLogEntry[]) {
  if (!import.meta.env.DEV) return
  for (const entry of entries) {
    const sanitized = sanitizeDevelopmentConsoleEntry(entry)
    if (!sanitized) continue
    if (sanitized.level === 'debug') console.debug(sanitized.message, sanitized.details)
    else if (sanitized.level === 'info') console.info(sanitized.message, sanitized.details)
    else if (sanitized.level === 'warning') console.warn(sanitized.message, sanitized.details)
    else console.error(sanitized.message, sanitized.details)
  }
}

export const webviewLogging = createWebviewLogger({
  onSendError() {
    if (import.meta.env.DEV) console.warn('Unable to send webview logs to Clotho')
  },
  sendBatch(entries) {
    if (!isDesktopRuntime()) {
      writeDevelopmentConsole(entries)
      return
    }
    sendMessageToDesktop('appLogBatch', { entries })
  },
})

export function getLogger(category: string) {
  return webviewLogging.getLogger(category)
}

export function installWebviewErrorLogging(target: Window = window) {
  const logger = getLogger('app')
  const handleError = (event: ErrorEvent) => {
    logger.error('webview.unhandled_error', 'An unhandled webview error occurred', {
      context: {
        column: event.colno,
        line: event.lineno,
      },
      error: event.error ?? new Error(event.message || 'Unknown webview error'),
    })
  }
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    logger.error('webview.unhandled_rejection', 'An unhandled webview rejection occurred', {
      error: event.reason,
    })
  }

  target.addEventListener('error', handleError)
  target.addEventListener('unhandledrejection', handleUnhandledRejection)

  return () => {
    target.removeEventListener('error', handleError)
    target.removeEventListener('unhandledrejection', handleUnhandledRejection)
  }
}
