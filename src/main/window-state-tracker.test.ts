// @vitest-environment node
import { describe, expect, test } from 'vitest'

import type { StoredWindowState } from './window-state'
import { createWindowStateTracker } from './window-state-tracker'

const initial: StoredWindowState = {
  id: 'window-a',
  kind: 'free',
  frame: { x: 160, y: 100, width: 1280, height: 800 },
  isMaximized: false,
}

describe('window state tracking', () => {
  test('persists the initial frame on shutdown without requiring a window event', async () => {
    let persisted: StoredWindowState | undefined
    const tracker = createWindowStateTracker({
      initialState: initial,
      persist: async (state) => {
        persisted = state
      },
    })

    await tracker.flush()

    expect(persisted).toEqual(initial)
  })

  test('flushes the latest normal frame before application shutdown', async () => {
    let persisted: StoredWindowState | undefined
    const tracker = createWindowStateTracker({
      initialState: initial,
      persist: async (state) => {
        persisted = state
      },
    })

    tracker.update({
      frame: { x: 240, y: 120, width: 1100, height: 720 },
      isFullScreen: false,
      isMaximized: false,
    })
    await tracker.flush()

    expect(persisted).toEqual({
      id: 'window-a',
      kind: 'free',
      frame: { x: 240, y: 120, width: 1100, height: 720 },
      isMaximized: false,
    })
  })

  test('persists maximized state without replacing the last normal frame', async () => {
    let persisted: StoredWindowState | undefined
    const tracker = createWindowStateTracker({
      initialState: initial,
      persist: async (state) => {
        persisted = state
      },
    })

    tracker.update({
      frame: { x: 0, y: 0, width: 1600, height: 1000 },
      isFullScreen: false,
      isMaximized: true,
    })
    await tracker.flush()

    expect(persisted).toEqual({ ...initial, isMaximized: true })
  })
})
