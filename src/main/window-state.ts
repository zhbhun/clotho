import { randomUUID } from 'node:crypto'

import type { Rectangle } from 'electron'

export type WindowFrame = Rectangle
/** The display fields the window-state resolution relies on (satisfied by Electron displays). */
export type WindowDisplay = {
  id: number
  workArea: Rectangle
  bounds?: Rectangle
  scaleFactor?: number
  isPrimary?: boolean
}

export interface StoredWindowState {
  id: string
  frame: WindowFrame
  isMaximized: boolean
  /**
   * Opaque per-window payload owned by the renderer (open tabs, active
   * session, ...); the main process stores and returns it verbatim.
   */
  ui?: Record<string, unknown>
}

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

export function sanitizeWindowState(value: unknown): StoredWindowState | undefined {
  if (
    !isObject(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    !isRectangle(value.frame) ||
    typeof value.isMaximized !== 'boolean'
  ) {
    return undefined
  }
  return {
    id: value.id,
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

/** Replaces or removes the ui payload of one window entry inside the container. */
export function withWindowUiState(
  windowsState: WindowsState | undefined,
  windowId: string,
  ui: Record<string, unknown> | undefined,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  let openedWindows = base.openedWindows
  if (!openedWindows.some((entry) => entry.id === windowId)) {
    openedWindows = [
      ...openedWindows,
      { id: windowId, frame: { ...FALLBACK_FRAME }, isMaximized: false },
    ]
  }
  return {
    ...base,
    openedWindows: openedWindows.map((entry) =>
      entry.id === windowId
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

export function resolveWindowState(
  value: unknown,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): StoredWindowState {
  const available = availableDisplays(displays, primaryDisplay)
  const primary = primaryFrom(available, primaryDisplay)
  const saved = sanitizeWindowsState(value)
  const entry = saved
    ? (saved.openedWindows.find((window) => window.id === saved.lastActiveWindow) ??
      saved.openedWindows[0])
    : undefined
  if (!entry) {
    return {
      id: randomUUID(),
      frame: primary ? centerDefaultFrame(primary.workArea) : { ...FALLBACK_FRAME },
      isMaximized: false,
    }
  }

  const target = overlappingDisplay(entry.frame, available) ?? primary
  return {
    id: entry.id,
    frame: target ? fitFrame(entry.frame, target.workArea) : { ...entry.frame },
    isMaximized: entry.isMaximized,
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
