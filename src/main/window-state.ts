import { randomUUID } from 'node:crypto'

import type { Rectangle } from 'electron'

import type { WindowKind } from '@/shared/rpc'

export type WindowFrame = Rectangle
/** The display fields the window-state resolution relies on (satisfied by Electron displays). */
export type WindowDisplay = {
  id: number
  workArea: Rectangle
  bounds?: Rectangle
  scaleFactor?: number
  isPrimary?: boolean
}

export type { WindowKind }

export interface StoredWindowState {
  id: string
  kind: WindowKind
  /** The project a focused window is bound to; absent on the main window. */
  projectId?: string
  frame: WindowFrame
  isMaximized: boolean
  /**
   * Opaque per-window payload owned by the renderer (open tabs, active
   * session, ...); the main process stores and returns it verbatim.
   */
  ui?: Record<string, unknown>
}

/** What the main process needs to address a window entry without its geometry. */
export type WindowIdentity = Pick<StoredWindowState, 'id' | 'kind' | 'projectId'>

export interface WindowsState {
  /** Id of the window that had focus, referencing an entry in openedWindows. */
  lastActiveWindow?: string
  openedWindows: StoredWindowState[]
}

export interface WindowStateUpdate {
  frame: WindowFrame
  isFullScreen: boolean
  isMaximized: boolean
}

const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 800
const DEFAULT_WORK_AREA_RATIO = 0.9
const CASCADE_OFFSET = 40
const FALLBACK_FRAME: WindowFrame = { x: 120, y: 80, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRectangle(value: unknown): value is Rectangle {
  if (!isObject(value)) return false
  return (
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.width) &&
    value.width > 0 &&
    isFiniteNumber(value.height) &&
    value.height > 0
  )
}

function isDisplay(value: unknown): value is WindowDisplay {
  if (!isObject(value)) return false
  return isFiniteNumber(value.id) && isRectangle(value.workArea)
}

function identityOf(value: Record<string, unknown>): WindowIdentity | undefined {
  if (typeof value.id !== 'string' || value.id.length === 0) return undefined
  if (value.kind === 'main') return { id: value.id, kind: 'main' }
  if (value.kind === 'focused' && typeof value.projectId === 'string' && value.projectId) {
    return { id: value.id, kind: 'focused', projectId: value.projectId }
  }
  return undefined
}

export function sanitizeWindowState(value: unknown): StoredWindowState | undefined {
  if (!isObject(value) || !isRectangle(value.frame) || typeof value.isMaximized !== 'boolean') {
    return undefined
  }
  const identity = identityOf(value)
  if (!identity) return undefined
  return {
    ...identity,
    frame: { ...value.frame },
    isMaximized: value.isMaximized,
    ...(isObject(value.ui) ? { ui: { ...value.ui } } : {}),
  }
}

export function sanitizeWindowsState(value: unknown): WindowsState | undefined {
  if (!isObject(value)) return undefined
  const openedWindows = Array.isArray(value.openedWindows)
    ? value.openedWindows
        .map((entry) => sanitizeWindowState(entry))
        .filter((entry): entry is StoredWindowState => entry !== undefined)
    : []
  return {
    lastActiveWindow:
      typeof value.lastActiveWindow === 'string' && value.lastActiveWindow.length > 0
        ? value.lastActiveWindow
        : undefined,
    openedWindows,
  }
}

export function windowUiStateOf(
  windowsState: WindowsState | undefined,
  windowId: string,
): Record<string, unknown> | undefined {
  return windowsState?.openedWindows.find((entry) => entry.id === windowId)?.ui
}

export function focusedWindowEntries(windowsState: WindowsState | undefined): StoredWindowState[] {
  return windowsState?.openedWindows.filter((entry) => entry.kind === 'focused') ?? []
}

/** Replaces or removes the ui payload of one window entry inside the container. */
export function withWindowUiState(
  windowsState: WindowsState | undefined,
  window: WindowIdentity,
  ui: Record<string, unknown> | undefined,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  let openedWindows = base.openedWindows
  if (!openedWindows.some((entry) => entry.id === window.id)) {
    openedWindows = [
      ...openedWindows,
      { ...window, frame: { ...FALLBACK_FRAME }, isMaximized: false },
    ]
  }
  return {
    ...base,
    openedWindows: openedWindows.map((entry) =>
      entry.id === window.id
        ? ui
          ? { ...entry, ui: { ...ui } }
          : (() => {
              const next = { ...entry }
              delete next.ui
              return next
            })()
        : entry,
    ),
  }
}

/** Replaces one window's geometry in the container, keeping every other field (ui included). */
export function withWindowEntry(
  windowsState: WindowsState | undefined,
  entry: StoredWindowState,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  const exists = base.openedWindows.some((candidate) => candidate.id === entry.id)
  return {
    lastActiveWindow: entry.id,
    openedWindows: exists
      ? base.openedWindows.map((candidate) =>
          candidate.id === entry.id
            ? { ...candidate, frame: { ...entry.frame }, isMaximized: entry.isMaximized }
            : candidate,
        )
      : [...base.openedWindows, { ...entry }],
  }
}

/** Rebinds a focused window entry to another project. */
export function withWindowProject(
  windowsState: WindowsState | undefined,
  windowId: string,
  projectId: string,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  return {
    ...base,
    openedWindows: base.openedWindows.map((entry) =>
      entry.id === windowId && entry.kind === 'focused' ? { ...entry, projectId } : entry,
    ),
  }
}

export function withoutWindowEntry(
  windowsState: WindowsState | undefined,
  windowId: string,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  return {
    lastActiveWindow: base.lastActiveWindow === windowId ? undefined : base.lastActiveWindow,
    openedWindows: base.openedWindows.filter((entry) => entry.id !== windowId),
  }
}

function availableDisplays(displays: WindowDisplay[], primaryDisplay: WindowDisplay) {
  const available = displays.filter(isDisplay)
  if (isDisplay(primaryDisplay) && !available.some((display) => display.id === primaryDisplay.id)) {
    available.push(primaryDisplay)
  }
  return available
}

function primaryFrom(displays: WindowDisplay[], primaryDisplay: WindowDisplay) {
  return (
    displays.find((display) => display.id === primaryDisplay.id) ??
    displays.find((display) => display.isPrimary) ??
    displays[0]
  )
}

function centerDefaultFrame(workArea: Rectangle): WindowFrame {
  const width = Math.min(DEFAULT_WIDTH, Math.floor(workArea.width * DEFAULT_WORK_AREA_RATIO))
  const height = Math.min(DEFAULT_HEIGHT, Math.floor(workArea.height * DEFAULT_WORK_AREA_RATIO))
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  }
}

function intersectionArea(left: Rectangle, right: Rectangle) {
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x),
  )
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y),
  )
  return width * height
}

function overlappingDisplay(frame: Rectangle, displays: WindowDisplay[]) {
  let best: WindowDisplay | undefined
  let bestArea = 0
  for (const display of displays) {
    const area = intersectionArea(frame, display.workArea)
    if (area > bestArea) {
      best = display
      bestArea = area
    }
  }
  return best
}

function fitFrame(frame: WindowFrame, workArea: Rectangle): WindowFrame {
  const width = Math.min(frame.width, workArea.width)
  const height = Math.min(frame.height, workArea.height)
  const maxX = workArea.x + workArea.width - width
  const maxY = workArea.y + workArea.height - height
  return {
    x: Math.min(maxX, Math.max(workArea.x, frame.x)),
    y: Math.min(maxY, Math.max(workArea.y, frame.y)),
    width,
    height,
  }
}

/** Moves a stored frame onto the display it overlaps most (the primary one when none). */
function fitToDisplays(
  frame: WindowFrame,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): WindowFrame {
  const available = availableDisplays(displays, primaryDisplay)
  const target = overlappingDisplay(frame, available) ?? primaryFrom(available, primaryDisplay)
  return target ? fitFrame(frame, target.workArea) : { ...frame }
}

/** The runtime entry for a stored window: identity and geometry fitted to the current displays. */
export function fitStoredWindow(
  entry: StoredWindowState,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): StoredWindowState {
  return {
    id: entry.id,
    kind: entry.kind,
    ...(entry.projectId ? { projectId: entry.projectId } : {}),
    frame: fitToDisplays(entry.frame, displays, primaryDisplay),
    isMaximized: entry.isMaximized,
  }
}

/** A frame stepped down and right from another window, kept on that window's display. */
export function cascadeFrame(
  from: WindowFrame,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): WindowFrame {
  return fitToDisplays(
    {
      x: from.x + CASCADE_OFFSET,
      y: from.y + CASCADE_OFFSET,
      width: from.width,
      height: from.height,
    },
    displays,
    primaryDisplay,
  )
}

export function resolveMainWindowState(
  value: unknown,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): StoredWindowState {
  const saved = sanitizeWindowsState(value)
  const mainEntries = saved?.openedWindows.filter((entry) => entry.kind === 'main') ?? []
  const entry =
    mainEntries.find((candidate) => candidate.id === saved?.lastActiveWindow) ?? mainEntries[0]
  if (entry) return fitStoredWindow(entry, displays, primaryDisplay)

  const available = availableDisplays(displays, primaryDisplay)
  const primary = primaryFrom(available, primaryDisplay)
  return {
    id: randomUUID(),
    kind: 'main',
    frame: primary ? centerDefaultFrame(primary.workArea) : { ...FALLBACK_FRAME },
    isMaximized: false,
  }
}

export function newFocusedWindowState(
  projectId: string,
  from: WindowFrame,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): StoredWindowState {
  return {
    id: randomUUID(),
    kind: 'focused',
    projectId,
    frame: cascadeFrame(from, displays, primaryDisplay),
    isMaximized: false,
  }
}

export function updateWindowState(
  previous: StoredWindowState,
  update: WindowStateUpdate,
): StoredWindowState {
  if (update.isFullScreen) return previous
  if (update.isMaximized) return { ...previous, isMaximized: true }
  if (!isRectangle(update.frame)) return previous
  return { ...previous, frame: { ...update.frame }, isMaximized: false }
}
