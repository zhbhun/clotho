// @vitest-environment node
import { describe, expect, test } from 'vitest'

import {
  type StoredWindowState,
  type WindowDisplay,
  resolveWindowState,
  updateWindowState,
} from './window-state'

const primary: WindowDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1600, height: 1000 },
  workArea: { x: 0, y: 0, width: 1600, height: 1000 },
  scaleFactor: 1,
  isPrimary: true,
}

describe('window state resolution', () => {
  test('centers a 1280 by 800 first window in the primary work area', () => {
    expect(resolveWindowState(undefined, [primary], primary)).toEqual({
      frame: { x: 160, y: 100, width: 1280, height: 800 },
      isMaximized: false,
    })
  })

  test('limits the first window to 90 percent of a smaller work area', () => {
    const compactDisplay: WindowDisplay = {
      ...primary,
      bounds: { x: 0, y: 0, width: 1000, height: 700 },
      workArea: { x: 0, y: 0, width: 1000, height: 700 },
    }

    expect(resolveWindowState(undefined, [compactDisplay], compactDisplay)).toEqual({
      frame: { x: 50, y: 35, width: 900, height: 630 },
      isMaximized: false,
    })
  })

  test('keeps a restored window on the same display after displays are rearranged', () => {
    const saved: StoredWindowState = {
      version: 1,
      frame: { x: 1520, y: 60, width: 1000, height: 700 },
      display: {
        id: 2,
        workArea: { x: 1440, y: 0, width: 1440, height: 900 },
      },
      isMaximized: true,
    }
    const secondary: WindowDisplay = {
      id: 2,
      bounds: { x: 1920, y: 0, width: 1600, height: 1000 },
      workArea: { x: 1920, y: 0, width: 1600, height: 960 },
      scaleFactor: 1,
      isPrimary: false,
    }

    expect(resolveWindowState(saved, [primary, secondary], primary)).toEqual({
      frame: { x: 2000, y: 60, width: 1000, height: 700 },
      isMaximized: true,
    })
  })

  test('moves a window onto the primary display when its previous display is disconnected', () => {
    const saved: StoredWindowState = {
      version: 1,
      frame: { x: 1520, y: 60, width: 900, height: 600 },
      display: {
        id: 2,
        workArea: { x: 1440, y: 0, width: 1440, height: 900 },
      },
      isMaximized: false,
    }

    expect(resolveWindowState(saved, [primary], primary)).toEqual({
      frame: { x: 80, y: 60, width: 900, height: 600 },
      isMaximized: false,
    })
  })

  test('falls back to the primary display when a disconnected display overlaps a different secondary display', () => {
    const saved: StoredWindowState = {
      version: 1,
      frame: { x: 1520, y: 60, width: 900, height: 600 },
      display: {
        id: 2,
        workArea: { x: 1440, y: 0, width: 1440, height: 900 },
      },
      isMaximized: false,
    }
    const remainingSecondary: WindowDisplay = {
      id: 3,
      bounds: { x: 1440, y: 0, width: 1440, height: 900 },
      workArea: { x: 1440, y: 0, width: 1440, height: 900 },
      scaleFactor: 1,
      isPrimary: false,
    }

    expect(resolveWindowState(saved, [primary, remainingSecondary], primary)).toEqual({
      frame: { x: 80, y: 60, width: 900, height: 600 },
      isMaximized: false,
    })
  })

  test('fits an oversized off-screen frame inside a negative-coordinate work area', () => {
    const secondary: WindowDisplay = {
      id: 2,
      bounds: { x: -1280, y: 0, width: 1280, height: 720 },
      workArea: { x: -1280, y: 0, width: 1280, height: 720 },
      scaleFactor: 1,
      isPrimary: false,
    }
    const saved: StoredWindowState = {
      version: 1,
      frame: { x: -1500, y: -100, width: 1400, height: 900 },
      display: {
        id: 2,
        workArea: { x: -1440, y: 0, width: 1440, height: 900 },
      },
      isMaximized: false,
    }

    expect(resolveWindowState(saved, [primary, secondary], primary)).toEqual({
      frame: { x: -1280, y: 0, width: 1280, height: 720 },
      isMaximized: false,
    })
  })

  test('does not replace the normal frame while the window is maximized or fullscreen', () => {
    const normal: StoredWindowState = {
      version: 1,
      frame: { x: 160, y: 100, width: 1280, height: 800 },
      display: { id: 1, workArea: primary.workArea },
      isMaximized: false,
    }
    const maximized = updateWindowState(
      normal,
      {
        frame: { x: 0, y: 0, width: 1600, height: 1000 },
        isFullScreen: false,
        isMaximized: true,
      },
      [primary],
      primary,
    )

    expect(maximized).toEqual({ ...normal, isMaximized: true })
    expect(
      updateWindowState(
        maximized,
        {
          frame: { x: 0, y: 0, width: 1600, height: 1000 },
          isFullScreen: true,
          isMaximized: false,
        },
        [primary],
        primary,
      ),
    ).toEqual(maximized)
  })

  test('does not replace the last valid frame with a zero-sized native close frame', () => {
    const normal: StoredWindowState = {
      version: 1,
      frame: { x: 160, y: 100, width: 1280, height: 800 },
      display: { id: 1, workArea: primary.workArea },
      isMaximized: false,
    }

    expect(
      updateWindowState(
        normal,
        {
          frame: { x: 0, y: 0, width: 0, height: 0 },
          isFullScreen: false,
          isMaximized: false,
        },
        [primary],
        primary,
      ),
    ).toEqual(normal)
  })
})
