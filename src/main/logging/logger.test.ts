// @vitest-environment node
import { describe, expect, test } from 'vitest'

import type { AppLogRecord } from './logger'
import { createAppLogger } from './logger'

describe('app logger', () => {
  test('adds trusted run metadata to main and webview records at one sink', () => {
    const records: AppLogRecord[] = []
    const logging = createAppLogger({
      appVersion: '0.1.0',
      channel: 'stable',
      homeDir: '/Users/alice',
      runId: 'run-1',
      write: (record) => records.push(record),
    })

    logging.getLogger('app').info('app.started', 'Application started', {
      platform: 'darwin',
    })
    logging.recordWebviewBatch({
      entries: [
        {
          level: 'error',
          logger: 'clotho.webview.render',
          event: 'render.failed',
          message: 'Render failed',
          context: { boundary: 'application' },
          error: { name: 'TypeError', message: 'Broken' },
        },
      ],
    })

    expect(records).toEqual([
      {
        level: 'info',
        logger: 'clotho.app',
        message: 'Application started',
        properties: {
          schemaVersion: 1,
          event: 'app.started',
          process: 'main',
          runId: 'run-1',
          appVersion: '0.1.0',
          channel: 'stable',
          context: { platform: 'darwin' },
        },
      },
      {
        level: 'error',
        logger: 'clotho.webview.render',
        message: 'Webview rendering failed',
        properties: {
          schemaVersion: 1,
          event: 'render.failed',
          process: 'webview',
          runId: 'run-1',
          appVersion: '0.1.0',
          channel: 'stable',
          context: { boundary: 'application' },
          error: { name: 'TypeError', message: 'Error details omitted' },
        },
      },
    ])
  })

  test('contains sink failures so logging cannot alter application behavior', () => {
    const logging = createAppLogger({
      appVersion: '0.1.0',
      channel: 'stable',
      homeDir: '/Users/alice',
      runId: 'run-1',
      write: () => {
        throw new Error('disk unavailable')
      },
    })

    expect(() => logging.getLogger('app').info('app.started', 'Application started')).not.toThrow()
  })

  test('contains malformed webview payload access failures', () => {
    const logging = createAppLogger({
      appVersion: '0.1.0',
      channel: 'stable',
      homeDir: '/Users/alice',
      runId: 'run-1',
      write: () => undefined,
    })
    const payload = Object.defineProperty({}, 'entries', {
      get() {
        throw new Error('malicious getter')
      },
    })

    expect(() => logging.recordWebviewBatch(payload)).not.toThrow()
  })
})
