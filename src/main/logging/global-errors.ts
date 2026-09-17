type FatalEvent = 'app.startup_failed' | 'uncaught_exception' | 'unhandled_rejection'

type FatalErrorHandlerOptions = {
  exit: (code: number) => void
  fatal: (event: FatalEvent, message: string, caught: unknown) => void
  flush: () => Promise<void>
  timeoutMs: number
}

const FATAL_MESSAGES: Record<FatalEvent, string> = {
  'app.startup_failed': 'Clotho failed to start',
  uncaught_exception: 'An uncaught exception terminated Clotho',
  unhandled_rejection: 'An unhandled rejection terminated Clotho',
}

export function createFatalErrorHandler(options: FatalErrorHandlerOptions) {
  let isHandling = false

  return async (event: FatalEvent, caught: unknown) => {
    if (isHandling) return
    isHandling = true

    try {
      options.fatal(event, FATAL_MESSAGES[event], caught)
    } catch {
      // A logging failure must not prevent the process from terminating.
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        options.flush().catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, options.timeoutMs)
        }),
      ])
    } finally {
      if (timer) clearTimeout(timer)
      options.exit(1)
    }
  }
}

export function installGlobalErrorHandlers(
  handleFatalError: ReturnType<typeof createFatalErrorHandler>,
) {
  const handleUncaughtException = (caught: unknown) => {
    void handleFatalError('uncaught_exception', caught)
  }
  const handleUnhandledRejection = (caught: unknown) => {
    void handleFatalError('unhandled_rejection', caught)
  }

  process.on('uncaughtException', handleUncaughtException)
  process.on('unhandledRejection', handleUnhandledRejection)

  return () => {
    process.off('uncaughtException', handleUncaughtException)
    process.off('unhandledRejection', handleUnhandledRejection)
  }
}
