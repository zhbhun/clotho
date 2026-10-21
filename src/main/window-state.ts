import { randomUUID } from 'node:crypto'

import type { Rectangle } from 'electron'

import type { ProjectUiState, WindowKind, WorkbenchWindowUiState, WorkspaceKey } from '@/shared/rpc'

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
  /** The project a project window is bound to; absent on a free window. */
  projectId?: string
  frame: WindowFrame
  isMaximized: boolean
  /**
   * The renderer-owned ui payload of a free window (open workspaces, tabs,
   * active session); stored verbatim after a shape check. Free windows only —
   * a project window's workspace lives in projectState.
   */
  ui?: WorkbenchWindowUiState
}

/**
 * A project's persisted state, kept even while no project window is open.
 * `frame`/`isMaximized` mirror the project window entry's geometry — the
 * entry is the live geometry while the window exists (one writer: the
 * window tracker persist), this one survives it for the next opening.
 */
export interface ProjectWindowState {
  frame: WindowFrame
  isMaximized: boolean
  /** The renderer-owned workspace ui (tabs and active session) last shown. */
  ui: ProjectUiState
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function stringRecordOf<T>(value: unknown, item: (entry: unknown) => T | undefined) {
  if (!isObject(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, entry]) => {
    const valid = item(entry)
    return valid === undefined ? [] : [[key, valid] as const]
  })
  return Object.fromEntries(entries)
}

function nullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined
}

/** Shape-checks a free window's ui payload; malformed payloads lose their ui. */
function sanitizeWindowUi(value: unknown): WorkbenchWindowUiState | undefined {
  if (
    !isObject(value) ||
    typeof value.currentWorkspaceKey !== 'string' ||
    !value.currentWorkspaceKey
  ) {
    return undefined
  }
  const sessionTabsByWorkspace = stringRecordOf(value.sessionTabsByWorkspace, (entry) =>
    isStringArray(entry) ? [...entry] : undefined,
  )
  const activeSessionByWorkspace = stringRecordOf(value.activeSessionByWorkspace, nullableString)
  if (!sessionTabsByWorkspace || !activeSessionByWorkspace) return undefined
  return {
    currentWorkspaceKey: value.currentWorkspaceKey as WorkspaceKey,
    sessionTabsByWorkspace,
    activeSessionByWorkspace,
  }
}

/** Shape-checks a project's ui payload, dropping an active id outside the tabs. */
function sanitizeProjectUi(value: unknown): ProjectUiState {
  if (!isObject(value) || !isStringArray(value.sessionIds)) {
    return { sessionIds: [], activeSessionId: null }
  }
  const sessionIds = [...new Set(value.sessionIds)]
  const activeSessionId =
    typeof value.activeSessionId === 'string' && sessionIds.includes(value.activeSessionId)
      ? value.activeSessionId
      : null
  return { sessionIds, activeSessionId }
}

function identityOf(value: Record<string, unknown>): WindowIdentity | undefined {
  if (typeof value.id !== 'string' || value.id.length === 0) return undefined
  if (value.kind === 'free') return { id: value.id, kind: 'free' }
  if (value.kind === 'project' && typeof value.projectId === 'string' && value.projectId) {
    return { id: value.id, kind: 'project', projectId: value.projectId }
  }
  return undefined
}

export function sanitizeWindowState(value: unknown): StoredWindowState | undefined {
  if (!isObject(value) || !isRectangle(value.frame) || typeof value.isMaximized !== 'boolean') {
    return undefined
  }
  const identity = identityOf(value)
  if (!identity) return undefined
  const ui = identity.kind === 'free' ? sanitizeWindowUi(value.ui) : undefined
  return {
    ...identity,
    frame: { ...value.frame },
    isMaximized: value.isMaximized,
    // A project window's workspace is projectState's business, not the entry's.
    ...(ui ? { ui } : {}),
  }
}

export function sanitizeProjectStates(value: unknown): Record<string, ProjectWindowState> {
  if (!isObject(value)) return {}
  const states: Record<string, ProjectWindowState> = {}
  for (const [projectId, entry] of Object.entries(value)) {
    if (!isObject(entry) || !isRectangle(entry.frame) || typeof entry.isMaximized !== 'boolean') {
      continue
    }
    states[projectId] = {
      frame: { ...entry.frame },
      isMaximized: entry.isMaximized,
      ui: sanitizeProjectUi(entry.ui),
    }
  }
  return states
}

/** Merges a geometry and/or ui patch into one project's persisted state. */
export function withProjectState(
  states: Record<string, ProjectWindowState>,
  projectId: string,
  patch: { frame?: WindowFrame; isMaximized?: boolean; ui?: ProjectUiState },
): Record<string, ProjectWindowState> {
  const previous = states[projectId]
  return {
    ...states,
    [projectId]: {
      frame: patch.frame ?? previous?.frame ?? { ...FALLBACK_FRAME },
      isMaximized: patch.isMaximized ?? previous?.isMaximized ?? false,
      ui: patch.ui ?? previous?.ui ?? { sessionIds: [], activeSessionId: null },
    },
  }
}

export function withoutProjectState(
  states: Record<string, ProjectWindowState>,
  projectId: string,
): Record<string, ProjectWindowState> {
  const next = { ...states }
  delete next[projectId]
  return next
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
): WorkbenchWindowUiState | undefined {
  return windowsState?.openedWindows.find((entry) => entry.id === windowId)?.ui
}

export function projectWindowEntries(windowsState: WindowsState | undefined): StoredWindowState[] {
  return windowsState?.openedWindows.filter((entry) => entry.kind === 'project') ?? []
}

/** Replaces or removes the ui payload of one window entry inside the container. */
export function withWindowUiState(
  windowsState: WindowsState | undefined,
  window: WindowIdentity,
  ui: WorkbenchWindowUiState | undefined,
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

/** Rebinds a project window entry to another project. */
export function withWindowProject(
  windowsState: WindowsState | undefined,
  windowId: string,
  projectId: string,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  return {
    ...base,
    openedWindows: base.openedWindows.map((entry) =>
      entry.id === windowId && entry.kind === 'project' ? { ...entry, projectId } : entry,
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

/** The stored free window to reopen (last active, else the only one), or a fresh centered one. */
export function resolveFreeWindowState(
  value: unknown,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): StoredWindowState {
  const saved = sanitizeWindowsState(value)
  const freeEntries = saved?.openedWindows.filter((entry) => entry.kind === 'free') ?? []
  const entry =
    freeEntries.find((candidate) => candidate.id === saved?.lastActiveWindow) ?? freeEntries[0]
  if (entry) return fitStoredWindow(entry, displays, primaryDisplay)

  const available = availableDisplays(displays, primaryDisplay)
  const primary = primaryFrom(available, primaryDisplay)
  return {
    id: randomUUID(),
    kind: 'free',
    frame: primary ? centerDefaultFrame(primary.workArea) : { ...FALLBACK_FRAME },
    isMaximized: false,
  }
}

/** A new free window's entry, stepped down and right from `from`. */
export function newFreeWindowState(
  from: WindowFrame,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): StoredWindowState {
  return {
    id: randomUUID(),
    kind: 'free',
    frame: cascadeFrame(from, displays, primaryDisplay),
    isMaximized: false,
  }
}

export function newProjectWindowState(
  projectId: string,
  from: WindowFrame,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
  /** The project's persisted state; its geometry is reused instead of cascading from `from`. */
  stored?: Pick<ProjectWindowState, 'frame' | 'isMaximized'>,
): StoredWindowState {
  return {
    id: randomUUID(),
    kind: 'project',
    projectId,
    frame: stored
      ? fitToDisplays(stored.frame, displays, primaryDisplay)
      : cascadeFrame(from, displays, primaryDisplay),
    isMaximized: stored?.isMaximized ?? false,
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
