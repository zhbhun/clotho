import { act, fireEvent, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'

import {
  type ShortcutRuntime,
  ShortcutRuntimeProvider,
  createShortcutRuntime,
} from '../../../services/shortcuts/runtime'
import { usePrimaryModifierHeld } from './use-primary-modifier-held'

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

describe('usePrimaryModifierHeld', () => {
  test('tracks the meta key as primary on mac', () => {
    const { result } = renderHook(() => usePrimaryModifierHeld(), {
      wrapper: createWrapper('mac'),
    })
    expect(result.current).toBe(false)

    act(() => fireEvent.keyDown(window, { key: 'Meta', metaKey: true }))
    expect(result.current).toBe(true)

    act(() => fireEvent.keyUp(window, { key: 'Meta' }))
    expect(result.current).toBe(false)
  })

  test('ignores non-primary modifiers on mac', () => {
    const { result } = renderHook(() => usePrimaryModifierHeld(), {
      wrapper: createWrapper('mac'),
    })

    act(() => fireEvent.keyDown(window, { key: 'Control', ctrlKey: true }))
    expect(result.current).toBe(false)
  })

  test('tracks the ctrl key as primary on other platforms and resets on blur', () => {
    const { result } = renderHook(() => usePrimaryModifierHeld(), {
      wrapper: createWrapper('linux'),
    })

    act(() => fireEvent.keyDown(window, { key: 'Control', ctrlKey: true }))
    expect(result.current).toBe(true)

    act(() => fireEvent.blur(window))
    expect(result.current).toBe(false)
  })
})
