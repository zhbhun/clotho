// @vitest-environment node
import { describe, expect, test } from 'vitest'

import type { StoredWindowState, WindowDisplay } from './window-state'
import { createWindowStateTracker } from './window-state-tracker'

const primary: WindowDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1600, height: 1000 },
  workArea: { x: 0, y: 0, width: 1600, height: 1000 },
  scaleFactor: 1,
  isPrimary: true,
}

const initial: StoredWindowState = {
  version: 1,
  frame: { x: 160, y: 100, width: 1280, height: 800 },
  display: { id: 1, workArea: primary.workArea },
  isMaximized: false,
}

describe('window state tracking', () => {
  test('persists the initial frame on shutdown without requiring a window event', async () => {
    let persisted: StoredWindowState | undefined
    const tracker = createWindowStateTracker({
      initialState: initial,
      getDisplays: () => [primary],
      getPrimaryDisplay: () => primary,
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
      getDisplays: () => [primary],
      getPrimaryDisplay: () => primary,
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
      version: 1,
      frame: { x: 240, y: 120, width: 1100, height: 720 },
      display: { id: 1, workArea: primary.workArea },
      isMaximized: false,
    })
  })

  test('persists maximized state without replacing the last normal frame', async () => {
    let persisted: StoredWindowState | undefined
    const tracker = createWindowStateTracker({
      initialState: initial,
      getDisplays: () => [primary],
      getPrimaryDisplay: () => primary,
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
