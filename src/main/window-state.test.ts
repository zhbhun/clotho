// @vitest-environment node
import { describe, expect, test } from 'vitest'

import {
  type StoredWindowState,
  type WindowDisplay,
  type WindowsState,
  resolveWindowState,
  sanitizeWindowsState,
  updateWindowState,
} from './window-state'

const primary: WindowDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1600, height: 1000 },
  workArea: { x: 0, y: 0, width: 1600, height: 1000 },
  scaleFactor: 1,
  isPrimary: true,
}

function windowsState(
  lastActiveWindow: string | undefined,
  openedWindows: StoredWindowState[],
): WindowsState {
  return { lastActiveWindow, openedWindows }
}

describe('window state resolution', () => {
  test('centers a 1280 by 800 first window in the primary work area', () => {
    const resolved = resolveWindowState(undefined, [primary], primary)

    expect(resolved.frame).toEqual({ x: 160, y: 100, width: 1280, height: 800 })
    expect(resolved.isMaximized).toBe(false)
    expect(resolved.id).toEqual(expect.any(String))
  })

  test('limits the first window to 90 percent of a smaller work area', () => {
    const compactDisplay: WindowDisplay = {
      ...primary,
      bounds: { x: 0, y: 0, width: 1000, height: 700 },
      workArea: { x: 0, y: 0, width: 1000, height: 700 },
    }

    expect(resolveWindowState(undefined, [compactDisplay], compactDisplay).frame).toEqual({
      x: 50,
      y: 35,
      width: 900,
      height: 630,
    })
  })

  test('restores the window referenced by lastActiveWindow', () => {
    const windows = windowsState('b', [
      { id: 'a', frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: false },
      { id: 'b', frame: { x: 1520, y: 60, width: 1000, height: 700 }, isMaximized: true },
    ])
    const secondary: WindowDisplay = {
      id: 2,
      bounds: { x: 1920, y: 0, width: 1600, height: 1000 },
      workArea: { x: 1920, y: 0, width: 1600, height: 960 },
      scaleFactor: 1,
      isPrimary: false,
    }

    const resolved = resolveWindowState(windows, [primary, secondary], primary)

    expect(resolved.id).toBe('b')
    expect(resolved.isMaximized).toBe(true)
    // The saved frame overlaps the secondary display the most and is clamped into it.
    expect(resolved.frame).toEqual({ x: 1920, y: 60, width: 1000, height: 700 })
  })

  test('falls back to the only stored window when lastActiveWindow is unknown', () => {
    const windows = windowsState('missing', [
      { id: 'a', frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: false },
    ])

    expect(resolveWindowState(windows, [primary], primary).id).toBe('a')
  })

  test('moves a stored frame onto the primary display when it overlaps nothing', () => {
    const windows = windowsState('a', [
      { id: 'a', frame: { x: 4000, y: 60, width: 900, height: 600 }, isMaximized: false },
    ])

    expect(resolveWindowState(windows, [primary], primary).frame).toEqual({
      x: 700,
      y: 60,
      width: 900,
      height: 600,
    })
  })

  test('clamps a stored frame inside a negative-coordinate work area', () => {
    const secondary: WindowDisplay = {
      id: 2,
      bounds: { x: -1280, y: 0, width: 1280, height: 720 },
      workArea: { x: -1280, y: 0, width: 1280, height: 720 },
      scaleFactor: 1,
      isPrimary: false,
    }
    const windows = windowsState('a', [
      { id: 'a', frame: { x: -1500, y: -100, width: 1400, height: 900 }, isMaximized: false },
    ])

    expect(resolveWindowState(windows, [primary, secondary], primary).frame).toEqual({
      x: -1280,
      y: 0,
      width: 1280,
      height: 720,
    })
  })

  test('does not replace the normal frame while the window is maximized or fullscreen', () => {
    const normal: StoredWindowState = {
      id: 'a',
      frame: { x: 160, y: 100, width: 1280, height: 800 },
      isMaximized: false,
    }
    const maximized = updateWindowState(normal, {
      frame: { x: 0, y: 0, width: 1600, height: 1000 },
      isFullScreen: false,
      isMaximized: true,
    })

    expect(maximized).toEqual({ ...normal, isMaximized: true })
    expect(
      updateWindowState(maximized, {
        frame: { x: 0, y: 0, width: 1600, height: 1000 },
        isFullScreen: true,
        isMaximized: false,
      }),
    ).toEqual(maximized)
  })

  test('does not replace the last valid frame with a zero-sized native close frame', () => {
    const normal: StoredWindowState = {
      id: 'a',
      frame: { x: 160, y: 100, width: 1280, height: 800 },
      isMaximized: false,
    }

    expect(
      updateWindowState(normal, {
        frame: { x: 0, y: 0, width: 0, height: 0 },
        isFullScreen: false,
        isMaximized: false,
      }),
    ).toEqual(normal)
  })
})

describe('window state sanitizing', () => {
  test('drops invalid entries and tolerates missing container fields', () => {
    const sanitized = sanitizeWindowsState({
      lastActiveWindow: 'a',
      openedWindows: [
        { id: 'a', frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: false },
        'junk',
        { id: '', frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: false },
      ],
    })

    expect(sanitized).toEqual({
      lastActiveWindow: 'a',
      openedWindows: [
        { id: 'a', frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: false },
      ],
    })
    expect(sanitizeWindowsState({ openedWindows: [] })).toEqual({
      lastActiveWindow: undefined,
      openedWindows: [],
    })
    expect(sanitizeWindowsState('junk')).toBeUndefined()
  })
})
