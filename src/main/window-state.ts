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
  version: 1
  frame: WindowFrame
  display: {
    id: number
    workArea: Rectangle
  }
  isMaximized: boolean
}

export interface ResolvedWindowState {
  frame: WindowFrame
  isMaximized: boolean
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRectangle(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return (
    isFiniteNumber(candidate.x) &&
    isFiniteNumber(candidate.y) &&
    isFiniteNumber(candidate.width) &&
    candidate.width > 0 &&
    isFiniteNumber(candidate.height) &&
    candidate.height > 0
  )
}

function isDisplay(value: unknown): value is WindowDisplay {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return isFiniteNumber(candidate.id) && isRectangle(candidate.workArea)
}

export function sanitizeWindowState(value: unknown): StoredWindowState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const candidate = value as Record<string, unknown>
  if (
    candidate.version !== 1 ||
    !isRectangle(candidate.frame) ||
    typeof candidate.isMaximized !== 'boolean' ||
    !candidate.display ||
    typeof candidate.display !== 'object' ||
    Array.isArray(candidate.display)
  ) {
    return undefined
  }

  const display = candidate.display as Record<string, unknown>
  if (!isFiniteNumber(display.id) || !isRectangle(display.workArea)) return undefined

  return {
    version: 1,
    frame: { ...candidate.frame },
    display: { id: display.id, workArea: { ...display.workArea } },
    isMaximized: candidate.isMaximized,
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
): ResolvedWindowState {
  const available = availableDisplays(displays, primaryDisplay)
  const primary = primaryFrom(available, primaryDisplay)
  if (!primary) return { frame: { ...FALLBACK_FRAME }, isMaximized: false }

  const saved = sanitizeWindowState(value)
  if (!saved) return { frame: centerDefaultFrame(primary.workArea), isMaximized: false }

  const target = available.find((display) => display.id === saved.display.id) ?? primary
  const translatedFrame = {
    ...saved.frame,
    x: target.workArea.x + saved.frame.x - saved.display.workArea.x,
    y: target.workArea.y + saved.frame.y - saved.display.workArea.y,
  }

  return {
    frame: fitFrame(translatedFrame, target.workArea),
    isMaximized: saved.isMaximized,
  }
}

export function createWindowState(
  frame: WindowFrame,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
  isMaximized: boolean,
): StoredWindowState {
  const available = availableDisplays(displays, primaryDisplay)
  const display =
    overlappingDisplay(frame, available) ?? primaryFrom(available, primaryDisplay) ?? primaryDisplay
  const workArea = isDisplay(display) ? display.workArea : frame
  return {
    version: 1,
    frame: { ...frame },
    display: {
      id: isFiniteNumber(display?.id) ? display.id : 0,
      workArea: { ...workArea },
    },
    isMaximized,
  }
}

export function updateWindowState(
  previous: StoredWindowState,
  update: WindowStateUpdate,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): StoredWindowState {
  if (update.isFullScreen) return previous
  if (update.isMaximized) return { ...previous, isMaximized: true }
  if (!isRectangle(update.frame)) return previous
  return createWindowState(update.frame, displays, primaryDisplay, false)
}
