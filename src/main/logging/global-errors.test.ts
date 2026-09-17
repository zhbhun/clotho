// @vitest-environment node
import { describe, expect, test, vi } from 'vitest'

import { createFatalErrorHandler } from './global-errors'

describe('fatal error handler', () => {
  test('logs once, waits for flushing, and exits', async () => {
    const fatal = vi.fn()
    const flush = vi.fn().mockResolvedValue(undefined)
    const exit = vi.fn()
    const handleFatalError = createFatalErrorHandler({ exit, fatal, flush, timeoutMs: 1_000 })

    const handled = handleFatalError('uncaught_exception', new Error('broken'))
    handleFatalError('unhandled_rejection', new Error('ignored duplicate'))
    await handled

    expect(fatal).toHaveBeenCalledOnce()
    expect(fatal).toHaveBeenCalledWith(
      'uncaught_exception',
      'An uncaught exception terminated Clotho',
      expect.any(Error),
    )
    expect(flush).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledOnce()
    expect(exit).toHaveBeenCalledWith(1)
  })

  test('exits when flushing exceeds the deadline', async () => {
    vi.useFakeTimers()
    const exit = vi.fn()
    const handleFatalError = createFatalErrorHandler({
      exit,
      fatal: vi.fn(),
      flush: () => new Promise(() => undefined),
      timeoutMs: 1_000,
    })

    const handled = handleFatalError('unhandled_rejection', new Error('broken'))
    await vi.advanceTimersByTimeAsync(1_000)
    await handled

    expect(exit).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })
})
