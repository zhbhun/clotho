import { describe, expect, it } from 'vitest'

import type { ClaudeContentPart, ClaudeJsonLine } from '@/shared/rpc'

import {
  averageCacheHitRate,
  backfillUsageFromHistory,
  createUsageStore,
  recordResultUsage,
} from './usage-store'

function assistantEntry(id: string, usage: { input?: number; read?: number; write?: number }) {
  return {
    type: 'assistant',
    message: {
      id,
      usage: {
        input_tokens: usage.input,
        cache_read_input_tokens: usage.read,
        cache_creation_input_tokens: usage.write,
      },
    },
  } as ClaudeJsonLine
}

function userPromptEntry(content: string | ClaudeContentPart[] = 'hello') {
  return { type: 'user', message: { role: 'user', content } } as ClaudeJsonLine
}

function toolResultUserEntry() {
  return {
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result' }] },
  } as ClaudeJsonLine
}

describe('usage store', () => {
  it('accumulates per-turn token usage', () => {
    const store = createUsageStore()
    store.setState((current) =>
      recordResultUsage(current, {
        input_tokens: 1000,
        cache_read_input_tokens: 9000,
        cache_creation_input_tokens: 100,
      }),
    )
    store.setState((current) =>
      recordResultUsage(current, {
        input_tokens: 500,
        cache_read_input_tokens: 4500,
      }),
    )

    const state = store.getState()
    expect(state.turnCount).toBe(2)
    expect(state.sumInputTokens).toBe(1500)
    expect(state.sumCacheReadTokens).toBe(13500)
    expect(state.sumCacheWriteTokens).toBe(100)
  })

  it('treats missing usage fields as zero', () => {
    const store = createUsageStore()
    store.setState((current) => recordResultUsage(current, undefined))

    const state = store.getState()
    expect(state.turnCount).toBe(1)
    expect(averageCacheHitRate(state)).toBeNull()
  })

  it('computes the average hit rate over all recorded turns', () => {
    const store = createUsageStore()
    store.setState((current) =>
      recordResultUsage(current, {
        input_tokens: 1000,
        cache_read_input_tokens: 3000,
        cache_creation_input_tokens: 1000,
      }),
    )
    store.setState((current) =>
      recordResultUsage(current, {
        input_tokens: 0,
        cache_read_input_tokens: 5000,
        cache_creation_input_tokens: 0,
      }),
    )

    expect(averageCacheHitRate(store.getState())).toBeCloseTo(8000 / 10000)
  })

  it('returns null before any turn reports tokens', () => {
    expect(averageCacheHitRate(createUsageStore().getState())).toBeNull()
  })

  it('counts one turn per user prompt, summing that turn assistant rounds', () => {
    const counters = backfillUsageFromHistory([
      userPromptEntry(),
      assistantEntry('msg_1', { input: 1000, read: 9000, write: 100 }),
      // Streamed assistant entries repeat per content block with the same id.
      assistantEntry('msg_1', { input: 1000, read: 9000, write: 100 }),
      // A second API round inside the same turn (the tool-use loop).
      assistantEntry('msg_2', { input: 500, read: 4500 }),
      userPromptEntry(),
      assistantEntry('msg_3', { input: 200, read: 800 }),
    ])

    expect(counters).toEqual({
      turnCount: 2,
      sumInputTokens: 1700,
      sumCacheReadTokens: 14300,
      sumCacheWriteTokens: 100,
    })
  })

  it('does not split a turn at tool-result or meta user entries', () => {
    const counters = backfillUsageFromHistory([
      userPromptEntry(),
      assistantEntry('msg_1', { input: 100 }),
      toolResultUserEntry(),
      assistantEntry('msg_2', { input: 50 }),
      { type: 'user', isMeta: true, message: { role: 'user', content: 'meta' } } as ClaudeJsonLine,
      assistantEntry('msg_3', { input: 25 }),
    ])

    expect(counters.turnCount).toBe(1)
    expect(counters.sumInputTokens).toBe(175)
  })

  it('excludes sidechain entries from the backfill', () => {
    const sidechain = {
      ...assistantEntry('msg_sub', { input: 8000, read: 0 }),
      isSidechain: true,
    } as ClaudeJsonLine

    expect(backfillUsageFromHistory([assistantEntry('msg_1', { input: 100 }), sidechain])).toEqual({
      turnCount: 1,
      sumInputTokens: 100,
      sumCacheReadTokens: 0,
      sumCacheWriteTokens: 0,
    })
  })

  it('replaces live counters when history is reloaded', () => {
    const store = createUsageStore()
    store.setState((current) => recordResultUsage(current, { input_tokens: 1000 }))
    store.setState((current) => ({
      ...current,
      ...backfillUsageFromHistory([assistantEntry('msg_1', { input: 2000, read: 8000 })]),
    }))

    const state = store.getState()
    expect(state.turnCount).toBe(1)
    expect(state.sumInputTokens).toBe(2000)
    expect(averageCacheHitRate(state)).toBeCloseTo(0.8)
  })
})
