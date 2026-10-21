// @vitest-environment node
import { describe, expect, test } from 'vitest'

import {
  type StoredWindowState,
  type WindowDisplay,
  type WindowsState,
  cascadeFrame,
  newFreeWindowState,
  newProjectWindowState,
  projectWindowEntries,
  resolveFreeWindowState,
  sanitizeProjectStates,
  sanitizeWindowsState,
  updateWindowState,
  withProjectState,
  withWindowEntry,
  withWindowProject,
  withoutProjectState,
  withoutWindowEntry,
} from './window-state'

const primary: WindowDisplay = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1600, height: 1000 },
  workArea: { x: 0, y: 0, width: 1600, height: 1000 },
  scaleFactor: 1,
  isPrimary: true,
}

function freeWindow(id: string, frame: StoredWindowState['frame'], isMaximized = false) {
  return { id, kind: 'free' as const, frame, isMaximized }
}

function windowsState(
  lastActiveWindow: string | undefined,
  openedWindows: StoredWindowState[],
): WindowsState {
  return { lastActiveWindow, openedWindows }
}

describe('window state resolution', () => {
  test('centers a 1280 by 800 first window in the primary work area', () => {
    const resolved = resolveFreeWindowState(undefined, [primary], primary)

    expect(resolved.frame).toEqual({ x: 160, y: 100, width: 1280, height: 800 })
    expect(resolved.isMaximized).toBe(false)
    expect(resolved.kind).toBe('free')
    expect(resolved.id).toEqual(expect.any(String))
  })

  test('limits the first window to 90 percent of a smaller work area', () => {
    const compactDisplay: WindowDisplay = {
      ...primary,
      bounds: { x: 0, y: 0, width: 1000, height: 700 },
      workArea: { x: 0, y: 0, width: 1000, height: 700 },
    }

    expect(resolveFreeWindowState(undefined, [compactDisplay], compactDisplay).frame).toEqual({
      x: 50,
      y: 35,
      width: 900,
      height: 630,
    })
  })

  test('restores the free window referenced by lastActiveWindow', () => {
    const windows = windowsState('b', [
      freeWindow('a', { x: 10, y: 10, width: 800, height: 600 }),
      freeWindow('b', { x: 1520, y: 60, width: 1000, height: 700 }, true),
    ])
    const secondary: WindowDisplay = {
      id: 2,
      bounds: { x: 1920, y: 0, width: 1600, height: 1000 },
      workArea: { x: 1920, y: 0, width: 1600, height: 960 },
      scaleFactor: 1,
      isPrimary: false,
    }

    const resolved = resolveFreeWindowState(windows, [primary, secondary], primary)

    expect(resolved.id).toBe('b')
    expect(resolved.isMaximized).toBe(true)
    // The saved frame overlaps the secondary display the most and is clamped into it.
    expect(resolved.frame).toEqual({ x: 1920, y: 60, width: 1000, height: 700 })
  })

  test('skips project entries and falls back to the stored free window', () => {
    const windows = windowsState('project-1', [
      {
        id: 'project-1',
        kind: 'project',
        projectId: 'p',
        frame: { x: 50, y: 50, width: 800, height: 600 },
        isMaximized: false,
      },
      freeWindow('a', { x: 10, y: 10, width: 800, height: 600 }),
    ])

    expect(resolveFreeWindowState(windows, [primary], primary).id).toBe('a')
  })

  test('moves a stored frame onto the primary display when it overlaps nothing', () => {
    const windows = windowsState('a', [
      freeWindow('a', { x: 4000, y: 60, width: 900, height: 600 }),
    ])

    expect(resolveFreeWindowState(windows, [primary], primary).frame).toEqual({
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
      freeWindow('a', { x: -1500, y: -100, width: 1400, height: 900 }),
    ])

    expect(resolveFreeWindowState(windows, [primary, secondary], primary).frame).toEqual({
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

  test('a new free window cascades from its opener', () => {
    const created = newFreeWindowState(
      { x: 100, y: 100, width: 800, height: 600 },
      [primary],
      primary,
    )

    expect(created.kind).toBe('free')
    expect(created.isMaximized).toBe(false)
    expect(created.frame).toEqual({ x: 140, y: 140, width: 800, height: 600 })
  })

  test('a project window reuses its stored geometry, cascading only without one', () => {
    const stored = newProjectWindowState(
      'p',
      { x: 100, y: 100, width: 800, height: 600 },
      [primary],
      primary,
      { frame: { x: 4000, y: 60, width: 900, height: 600 }, isMaximized: true },
    )
    expect(stored.kind).toBe('project')
    expect(stored.projectId).toBe('p')
    expect(stored.isMaximized).toBe(true)
    expect(stored.frame).toEqual({ x: 700, y: 60, width: 900, height: 600 })

    const cascaded = newProjectWindowState(
      'p',
      { x: 100, y: 100, width: 800, height: 600 },
      [primary],
      primary,
    )
    expect(cascaded.frame).toEqual({ x: 140, y: 140, width: 800, height: 600 })
    expect(cascaded.isMaximized).toBe(false)
  })

  test('does not replace the normal frame while the window is maximized or fullscreen', () => {
    const normal = freeWindow('a', { x: 160, y: 100, width: 1280, height: 800 })
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
    const normal = freeWindow('a', { x: 160, y: 100, width: 1280, height: 800 })

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
  test('drops legacy and invalid entries, and strips ui from project entries', () => {
    const sanitized = sanitizeWindowsState({
      lastActiveWindow: 'a',
      openedWindows: [
        {
          id: 'a',
          kind: 'free',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
          ui: { currentWorkspaceKey: 'home' },
        },
        {
          id: 'p',
          kind: 'project',
          projectId: 'proj',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
          ui: { currentWorkspaceKey: 'project:proj' },
        },
        // Legacy kinds from before free windows existed.
        {
          id: 'legacy',
          kind: 'main',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
        'junk',
        // No kind, an empty id, a project entry without a project, and a
        // free entry claiming a project.
        { id: 'b', frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: false },
        {
          id: '',
          kind: 'free',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
        {
          id: 'g',
          kind: 'project',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
        {
          id: 'h',
          kind: 'free',
          projectId: 'proj',
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
          kind: 'free',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
          ui: { currentWorkspaceKey: 'home' },
        },
        {
          id: 'p',
          kind: 'project',
          projectId: 'proj',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
        {
          id: 'h',
          kind: 'free',
          frame: { x: 10, y: 10, width: 800, height: 600 },
          isMaximized: false,
        },
      ],
    })
    expect(sanitizeWindowsState({ openedWindows: [] })).toEqual({
      lastActiveWindow: undefined,
      openedWindows: [],
    })
    expect(sanitizeWindowsState('junk')).toBeUndefined()
  })

  test('project state is sanitized per project and tolerates junk', () => {
    const states = sanitizeProjectStates({
      p: {
        window: { frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: true },
        ui: { currentWorkspaceKey: 'project:p' },
      },
      q: { window: { frame: { x: 0, y: 0, width: 0, height: 0 }, isMaximized: false } },
      r: { ui: {} },
      s: 'junk',
    })

    expect(states).toEqual({
      p: {
        window: { frame: { x: 10, y: 10, width: 800, height: 600 }, isMaximized: true },
        ui: { currentWorkspaceKey: 'project:p' },
      },
    })
    expect(sanitizeProjectStates('junk')).toEqual({})
  })

  test('project state patches merge, and a fresh project falls back to a default frame', () => {
    const seeded = withProjectState({}, 'p', { ui: { tabs: ['s1'] } })
    expect(seeded.p).toEqual({
      window: { frame: { x: 120, y: 80, width: 1280, height: 800 }, isMaximized: false },
      ui: { tabs: ['s1'] },
    })

    const moved = withProjectState(seeded, 'p', {
      window: { frame: { x: 50, y: 50, width: 900, height: 700 }, isMaximized: true },
    })
    expect(moved.p).toEqual({
      window: { frame: { x: 50, y: 50, width: 900, height: 700 }, isMaximized: true },
      ui: { tabs: ['s1'] },
    })

    const retabbed = withProjectState(moved, 'p', { ui: { tabs: ['s2'] } })
    expect(retabbed.p).toEqual({
      window: { frame: { x: 50, y: 50, width: 900, height: 700 }, isMaximized: true },
      ui: { tabs: ['s2'] },
    })
    expect(Object.keys(retabbed)).toEqual(['p'])

    expect(withoutProjectState(retabbed, 'p')).toEqual({})
  })

  test('geometry updates keep the ui payload and rebinding keeps the geometry', () => {
    const free: StoredWindowState = {
      id: 'a',
      kind: 'free',
      frame: { x: 10, y: 10, width: 800, height: 600 },
      isMaximized: false,
      ui: { currentWorkspaceKey: 'home' },
    }
    const moved = withWindowEntry(windowsState('x', [free]), {
      ...free,
      frame: { x: 50, y: 50, width: 900, height: 700 },
    })
    expect(moved.openedWindows[0]).toMatchObject({
      frame: { x: 50, y: 50, width: 900, height: 700 },
      ui: { currentWorkspaceKey: 'home' },
    })
    expect(moved.lastActiveWindow).toBe('a')

    const project: StoredWindowState = {
      id: 'f',
      kind: 'project',
      projectId: 'p',
      frame: { x: 10, y: 10, width: 800, height: 600 },
      isMaximized: false,
    }
    const rebound = withWindowProject(windowsState('f', [project]), 'f', 'q')
    expect(rebound.openedWindows[0]).toMatchObject({
      projectId: 'q',
      frame: { x: 10, y: 10, width: 800, height: 600 },
    })
    expect(projectWindowEntries(rebound)).toHaveLength(1)

    const removed = withoutWindowEntry(rebound, 'f')
    expect(removed).toEqual({ lastActiveWindow: undefined, openedWindows: [] })
  })
})
