// @vitest-environment node
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { getLogFilePath, getLoggingDestinations } from './runtime'

describe('logging runtime', () => {
  test.each([
    ['stable', path.join('/Users/alice/.clotho', 'logs', 'clotho.jsonl')],
    ['canary', path.join('/Users/alice/.clotho', 'logs', 'canary', 'clotho.jsonl')],
    ['dev', path.join('/Users/alice/.clotho', 'logs', 'clotho.dev.jsonl')],
  ] as const)('places %s logs at the expected path', (channel, expected) => {
    expect(getLogFilePath('/Users/alice/.clotho', channel)).toBe(expected)
  })

  test('uses memory only in tests and limits production output to files', () => {
    expect(getLoggingDestinations('test', 'dev')).toEqual(['memory'])
    expect(getLoggingDestinations('production', 'stable')).toEqual(['file'])
    expect(getLoggingDestinations('production', 'canary')).toEqual(['file'])
    expect(getLoggingDestinations('development', 'dev')).toEqual(['file', 'console'])
  })
})
