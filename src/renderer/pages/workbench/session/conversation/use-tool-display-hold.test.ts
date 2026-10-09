import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ConversationTimelineItem } from './types'
import { useToolDisplayHold } from './use-tool-display-hold'

type ToolItem = Extract<ConversationTimelineItem, { kind: 'tool' }>

function toolItem(id: string, extra: Partial<ToolItem> = {}): ConversationTimelineItem {
  return {
    id: `tool-${id}`,
    kind: 'tool',
    use: { type: 'tool_use', name: 'Edit', toolUseId: `${id}-use`, input: {} },
    ...extra,
  }
}

describe('useToolDisplayHold', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('holds a finished tool until its display window elapses', () => {
    const { result, rerender } = renderHook(({ items }) => useToolDisplayHold(items, true), {
      initialProps: { items: [toolItem('a')] },
    })

    // The result lands mid-window: the call keeps the tail until 500ms after
    // it first appeared, not until the result timestamp.
    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({
      items: [toolItem('a', { result: { type: 'tool_result', content: 'ok' } })],
    })
    expect(result.current.has('a-use')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current.has('a-use')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.has('a-use')).toBe(false)
  })

  it('lets a newer call take over while an earlier one is still held', () => {
    const { result, rerender } = renderHook(({ items }) => useToolDisplayHold(items, true), {
      initialProps: { items: [toolItem('a')] },
    })

    act(() => {
      vi.advanceTimersByTime(300)
    })
    rerender({ items: [toolItem('a'), toolItem('b')] })
    expect(result.current.has('a-use')).toBe(true)
    expect(result.current.has('b-use')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(result.current.has('a-use')).toBe(false)
    expect(result.current.has('b-use')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current.has('b-use')).toBe(false)
  })

  it('ignores non-tool items', () => {
    const { result } = renderHook(({ items }) => useToolDisplayHold(items, true), {
      initialProps: {
        items: [
          { id: 'x1', kind: 'text', text: 'Answer' } satisfies ConversationTimelineItem,
          { id: 'k1', kind: 'thinking', text: 'Reasoning' } satisfies ConversationTimelineItem,
        ],
      },
    })

    expect(result.current.size).toBe(0)
  })

  it('holds nothing while disabled', () => {
    const { result } = renderHook(({ items }) => useToolDisplayHold(items, false), {
      initialProps: { items: [toolItem('a')] },
    })

    expect(result.current.size).toBe(0)
  })
})
