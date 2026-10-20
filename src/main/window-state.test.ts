// @vitest-environment node
import { describe, expect, test } from 'vitest'

import {
  type StoredWindowState,
  type WindowDisplay,
  type WindowsState,
  cascadeFrame,
  resolveMainWindowState,
  sanitizeWindowsState,
  updateWindowState,
  withWindowEntry,
  withWindowProject,
  withoutWindowEntry,
} from './window-state'

const primary: WindowDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1600, height: 1000 },
  workArea: { x: 0, y: 0, width: 1600, height: 1000 },
  scaleFactor: 1,
  isPrimary: true,
}

function mainWindow(id: string, frame: StoredWindowState['frame'], isMaximized = false) {
  return { id, kind: 'main' as const, frame, isMaximized }
}

function windowsState(
  lastActiveWindow: string | undefined,
  openedWindows: StoredWindowState[],
): WindowsState {
  return { lastActiveWindow, openedWindows }
}

describe('window state resolution', () => {
  test('centers a 1280 by 800 first window in the primary work area', () => {
    const resolved = resolveMainWindowState(undefined, [primary], primary)

    expect(resolved.frame).toEqual({ x: 160, y: 100, width: 1280, height: 800 })
    expect(resolved.isMaximized).toBe(false)
    expect(resolved.kind).toBe('main')
    expect(resolved.id).toEqual(expect.any(String))
  })

  test('limits the first window to 90 percent of a smaller work area', () => {
    const compactDisplay: WindowDisplay = {
      ...primary,
      bounds: { x: 0, y: 0, width: 1000, height: 700 },
      workArea: { x: 0, y: 0, width: 1000, height: 700 },
    }

    expect(resolveMainWindowState(undefined, [compactDisplay], compactDisplay).frame).toEqual({
      x: 50,
      y: 35,
      width: 900,
      height: 630,
    })
  })

  test('restores the main window referenced by lastActiveWindow', () => {
    const windows = windowsState('b', [
      mainWindow('a', { x: 10, y: 10, width: 800, height: 600 }),
      mainWindow('b', { x: 1520, y: 60, width: 1000, height: 700 }, true),
    ])
    const secondary: WindowDisplay = {
      id: 2,
      bounds: { x: 1920, y: 0, width: 1600, height: 1000 },
      workArea: { x: 1920, y: 0, width: 1600, height: 960 },
      scaleFactor: 1,
      isPrimary: false,
    }

    const resolved = resolveMainWindowState(windows, [primary, secondary], primary)

    expect(resolved.id).toBe('b')
    expect(resolved.isMaximized).toBe(true)
    // The saved frame overlaps the secondary display the most and is clamped into it.
    expect(resolved.frame).toEqual({ x: 1920, y: 60, width: 1000, height: 700 })
  })

  test('skips focused entries and falls back to the stored main window', () => {
    const windows = windowsState('focused-1', [
      {
        id: 'focused-1',
        kind: 'focused',
        projectId: 'p',
        frame: { x: 50, y: 50, width: 800, height: 600 },
        isMaximized: false,
      },
      mainWindow('a', { x: 10, y: 10, width: 800, height: 600 }),
    ])

    expect(resolveMainWindowState(windows, [primary], primary).id).toBe('a')
  })

  test('moves a stored frame onto the primary display when it overlaps nothing', () => {
    const windows = windowsState('a', [
      mainWindow('a', { x: 4000, y: 60, width: 900, height: 600 }),
    ])

    expect(resolveMainWindowState(windows, [primary], primary).frame).toEqual({
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
      mainWindow('a', { x: -1500, y: -100, width: 1400, height: 900 }),
    ])

    expect(resolveMainWindowState(windows, [primary, secondary], primary).frame).toEqual({
      x: -1280,
      y: 0,
      width: 1280,
      height: 720,
    })
  })

  test('cascades a new window from its opener and keeps it on screen', () => {
    expect(cascadeFrame({ x: 100, y: 100, width: 800, height: 600 }, [primary], primary)).toEqual({
      x: 140,
      y: 140,
      width: 800,
      height: 600,
    })
    expect(cascadeFrame({ x: 780, y: 380, width: 800, height: 600 }, [primary], primary)).toEqual({
      x: 800,
      y: 400,
      width: 800,
      height: 600,
    })
  })

  test('does not replace the normal frame while the window is maximized or fullscreen', () => {
    const normal = mainWindow('a', { x: 160, y: 100, width: 1280, height: 800 })
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
    const normal = mainWindow('a', { x: 160, y: 100, width: 1280, height: 800 })

    expect(
      updateWindowState(normal, {
        frame: { x: 0, y: 0, width: 0, height: 0 },
        isFullScreen: false,
        isMaximized: false,
      }),
    ).toEqual(normal)
  })
})

describe('window state container', () => {
  test('drops invalid entries and tolerates missing container fields', () => {
    const sanitized = sanitizeWindowsState({
      lastActiveWindow: 'a',
      openedWindows: [
        {
          id: 'a',
          kind: 'main',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
        {
          id: 'f',
          kind: 'focused',
          projectId: 'p',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
          ui: { currentWorkspaceKey: 'project:p' },
        },
        'junk',
        // No kind, an empty id, and a focused entry without a project.
        { id: 'b', frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: false },
        {
          id: '',
          kind: 'main',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
        {
          id: 'g',
          kind: 'focused',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
      ],
    })

    expect(sanitized).toEqual({
      lastActiveWindow: 'a',
      openedWindows: [
        {
          id: 'a',
          kind: 'main',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
        {
          id: 'f',
          kind: 'focused',
          projectId: 'p',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
          ui: { currentWorkspaceKey: 'project:p' },
        },
      ],
    })
    expect(sanitizeWindowsState({ openedWindows: [] })).toEqual({
      lastActiveWindow: undefined,
      openedWindows: [],
    })
    expect(sanitizeWindowsState('junk')).toBeUndefined()
  })

  test('geometry updates keep the ui payload and rebinding keeps the geometry', () => {
    const focused: StoredWindowState = {
      id: 'f',
      kind: 'focused',
      projectId: 'p',
      frame: { x: 10, y: 10, width: 800, height: 600 },
      isMaximized: false,
      ui: { currentWorkspaceKey: 'project:p' },
    }
    const moved = withWindowEntry(windowsState('a', [focused]), {
      ...focused,
      frame: { x: 50, y: 50, width: 900, height: 700 },
    })
    expect(moved.openedWindows[0]).toMatchObject({
      frame: { x: 50, y: 50, width: 900, height: 700 },
      ui: { currentWorkspaceKey: 'project:p' },
    })
    expect(moved.lastActiveWindow).toBe('f')

    const rebound = withWindowProject(moved, 'f', 'q')
    expect(rebound.openedWindows[0]).toMatchObject({
      projectId: 'q',
      frame: moved.openedWindows[0].frame,
    })

    const removed = withoutWindowEntry(rebound, 'f')
    expect(removed).toEqual({ lastActiveWindow: undefined, openedWindows: [] })
  })
})
