import { act, fireEvent, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'

import {
  type ShortcutRuntime,
  ShortcutRuntimeProvider,
  createShortcutRuntime,
} from '../../../services/shortcuts/runtime'
import { PRIMARY_HINT_HOLD_MS, usePrimaryModifierHeld } from './use-primary-modifier-held'

function createWrapper(platform: 'mac' | 'linux') {
  const runtime: ShortcutRuntime = createShortcutRuntime({
    catalog: {},
    client: {
      load: vi.fn(async () => ({})),
      reset: vi.fn(async () => ({})),
      set: vi.fn(async () => ({})),
    },
    platform,
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ShortcutRuntimeProvider runtime={runtime}>{children}</ShortcutRuntimeProvider>
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('usePrimaryModifierHeld', () => {
  test('reveals the meta key as primary on mac only after the hold delay', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePrimaryModifierHeld(), {
      wrapper: createWrapper('mac'),
    })
    expect(result.current).toBe(false)

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Meta', metaKey: true })
    })
    expect(result.current).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRIMARY_HINT_HOLD_MS)
    })
    expect(result.current).toBe(true)

    await act(async () => {
      fireEvent.keyUp(window, { key: 'Meta' })
    })
    expect(result.current).toBe(false)
  })

  test('cancels the hint when the modifier is released before the delay', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePrimaryModifierHeld(), {
      wrapper: createWrapper('mac'),
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Meta', metaKey: true })
      await vi.advanceTimersByTimeAsync(PRIMARY_HINT_HOLD_MS - 1)
      fireEvent.keyUp(window, { key: 'Meta' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current).toBe(false)
  })

  test('ignores non-primary modifiers on mac', () => {
    const { result } = renderHook(() => usePrimaryModifierHeld(), {
      wrapper: createWrapper('mac'),
    })

    act(() => fireEvent.keyDown(window, { key: 'Control', ctrlKey: true }))
    expect(result.current).toBe(false)
  })

  test('tracks the ctrl key as primary on other platforms and resets on blur', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePrimaryModifierHeld(), {
      wrapper: createWrapper('linux'),
    })

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Control', ctrlKey: true })
    })
    expect(result.current).toBe(false)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(PRIMARY_HINT_HOLD_MS)
    })
    expect(result.current).toBe(true)

    await act(async () => {
      fireEvent.blur(window)
    })
    expect(result.current).toBe(false)
  })
})
