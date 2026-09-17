import { afterEach, describe, expect, test, vi } from 'vitest'

import type { WebviewLogEntry } from '@/shared/logging'

import { createWebviewLogger } from './logger'

describe('webview logger', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('batches ordinary records on the configured interval', () => {
    vi.useFakeTimers()
    const batches: WebviewLogEntry[][] = []
    const logging = createWebviewLogger({
      flushIntervalMs: 500,
      sendBatch: (entries) => batches.push(entries),
    })
    const logger = logging.getLogger('render')

    logger.info('render.ready', 'Workbench rendered', { boundary: 'workbench' })
    vi.advanceTimersByTime(499)
    expect(batches).toEqual([])

    vi.advanceTimersByTime(1)
    expect(batches).toEqual([
      [
        {
          level: 'info',
          logger: 'clotho.webview.render',
          event: 'render.ready',
          message: 'Workbench rendered',
          context: { boundary: 'workbench' },
        },
      ],
    ])
  })

  test('flushes immediately when a batch reaches its size limit', () => {
    vi.useFakeTimers()
    const batches: WebviewLogEntry[][] = []
    const logging = createWebviewLogger({
      maxBatchSize: 2,
      sendBatch: (entries) => batches.push(entries),
    })
    const logger = logging.getLogger('app')

    logger.info('webview.started', 'Webview started')
    logger.info('webview.ready', 'Webview ready')

    expect(batches).toHaveLength(1)
    expect(batches[0]?.map((entry) => entry.event)).toEqual(['webview.started', 'webview.ready'])
  })

  test('flushes errors immediately with serializable error details', () => {
    vi.useFakeTimers()
    const batches: WebviewLogEntry[][] = []
    const logging = createWebviewLogger({ sendBatch: (entries) => batches.push(entries) })
    const logger = logging.getLogger('render')

    logger.error('render.failed', 'Render failed', {
      componentStack: '\n    at Workbench',
      context: { boundary: 'workbench' },
      error: Object.assign(new TypeError('Broken render'), { code: 'E_RENDER' }),
    })

    expect(batches).toEqual([
      [
        {
          level: 'error',
          logger: 'clotho.webview.render',
          event: 'render.failed',
          message: 'Render failed',
          context: { boundary: 'workbench' },
          error: expect.objectContaining({
            name: 'TypeError',
            message: 'Broken render',
            code: 'E_RENDER',
            componentStack: '\n    at Workbench',
            stack: expect.stringContaining('Broken render'),
          }),
        },
      ],
    ])
  })

  test('contains transport failures and reports records dropped by the bounded queue', () => {
    vi.useFakeTimers()
    let isTransportAvailable = false
    const batches: WebviewLogEntry[][] = []
    const logging = createWebviewLogger({
      maxQueueSize: 2,
      sendBatch(entries) {
        if (!isTransportAvailable) throw new Error('bridge unavailable')
        batches.push(entries)
      },
    })
    const logger = logging.getLogger('app')
    logger.info('app.first', 'First')
    logger.info('app.second', 'Second')
    logger.info('app.third', 'Third')

    expect(() => logging.flush()).not.toThrow()
    isTransportAvailable = true
    logging.flush()

    expect(batches).toEqual([
      [
        {
          level: 'warning',
          logger: 'clotho.webview.logging',
          event: 'logging.records_dropped',
          message: 'Webview log records were dropped',
          context: { count: 1 },
        },
        expect.objectContaining({ event: 'app.second' }),
        expect.objectContaining({ event: 'app.third' }),
      ],
    ])
  })

  test('prioritizes an error when older records are waiting after a transport failure', () => {
    let isTransportAvailable = false
    const batches: WebviewLogEntry[][] = []
    const logging = createWebviewLogger({
      maxBatchSize: 2,
      sendBatch(entries) {
        if (!isTransportAvailable) throw new Error('bridge unavailable')
        batches.push(entries)
      },
    })
    const logger = logging.getLogger('app')
    logger.info('app.first', 'First')
    logger.info('app.second', 'Second')

    isTransportAvailable = true
    logger.error('webview.startup_failed', 'Startup failed', { error: new Error('broken') })

    expect(batches[0]?.map((entry) => entry.event)).toContain('webview.startup_failed')
  })

  test('contains malformed error access failures', () => {
    const logging = createWebviewLogger({ sendBatch: () => undefined })
    const logger = logging.getLogger('app')
    const error = Object.defineProperty({}, 'name', {
      get() {
        throw new Error('malicious getter')
      },
    })

    expect(() =>
      logger.error('webview.unhandled_error', 'Unhandled error', { error }),
    ).not.toThrow()
  })

  test('keeps the newest error when an all-error queue is saturated', () => {
    let isTransportAvailable = false
    const batches: WebviewLogEntry[][] = []
    const logging = createWebviewLogger({
      maxQueueSize: 2,
      sendBatch(entries) {
        if (!isTransportAvailable) throw new Error('bridge unavailable')
        batches.push(entries)
      },
    })
    const logger = logging.getLogger('app')
    logger.error('webview.unhandled_error', 'First', { error: new Error('first') })
    logger.error('webview.unhandled_error', 'Second', { error: new Error('second') })

    isTransportAvailable = true
    logger.error('webview.startup_failed', 'Newest', { error: new Error('newest') })

    expect(batches[0]?.map((entry) => entry.event)).toContain('webview.startup_failed')
  })
})
