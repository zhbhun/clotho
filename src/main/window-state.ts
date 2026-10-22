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

/** The runtime spec of an open window: identity plus live geometry. */
export interface WindowSpec {
  id: string
  kind: WindowKind
  /** The project a project window is bound to; absent on a free window. */
  projectId?: string
  frame: WindowFrame
  isMaximized: boolean
}

/**
 * A free window's persisted ui: the reopen geometry plus the renderer-owned
 * workspace payload (open workspaces, tabs, active session), kept when it
 * shape-checks. The tracker writes the geometry fields, the renderer writes
 * the workspace fields; the write helpers merge them field by field.
 */
export interface FreeWindowUi extends Partial<WorkbenchWindowUiState> {
  frame: WindowFrame
  isMaximized: boolean
}

/** A free window's persisted record: identity plus the ui it restores from. */
export interface StoredFreeWindowState {
  id: string
  kind: 'free'
  ui: FreeWindowUi
}

/**
 * A project window persists identity only: its geometry and workspace ui
 * live in projectState keyed by projectId, outliving the window itself.
 */
export interface StoredProjectWindowState extends WindowIdentity {
  kind: 'project'
  projectId: string
}

export type StoredWindowState = StoredFreeWindowState | StoredProjectWindowState

/**
 * A project window's persisted ui, kept even while no project window is
 * open: the reopen geometry plus the workspace (tabs and active session)
 * last shown. The tracker writes the geometry fields, the renderer writes
 * the workspace fields; withProjectState merges them field by field.
 */
export interface ProjectWindowState extends ProjectUiState {
  frame: WindowFrame
  isMaximized: boolean
}

/** One project's record in projectState: everything its window restores from. */
export interface ProjectStateRecord {
  ui: ProjectWindowState
}

/** What the main process needs to address a window entry without its geometry. */
export interface WindowIdentity {
  id: string
  kind: WindowKind
  /** The project a project window is bound to; absent on a free window. */
  projectId?: string
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

function identityOf(
  value: Record<string, unknown>,
): { id: string; kind: 'free' } | StoredProjectWindowState | undefined {
  if (typeof value.id !== 'string' || value.id.length === 0) return undefined
  if (value.kind === 'free') return { id: value.id, kind: 'free' }
  if (value.kind === 'project' && typeof value.projectId === 'string' && value.projectId) {
    return { id: value.id, kind: 'project', projectId: value.projectId }
  }
  return undefined
}

export function sanitizeWindowState(value: unknown): StoredWindowState | undefined {
  if (!isObject(value)) return undefined
  const identity = identityOf(value)
  if (!identity) return undefined
  // A project entry carries identity only; its geometry and ui live in
  // projectState, so anything else stored alongside is stripped.
  if (identity.kind === 'project') return identity
  // A free entry's geometry lives inside ui, so a shapeless ui drops the
  // whole record, while a malformed workspace payload only loses the payload.
  if (
    !isObject(value.ui) ||
    !isRectangle(value.ui.frame) ||
    typeof value.ui.isMaximized !== 'boolean'
  ) {
    return undefined
  }
  const workspace = sanitizeWindowUi(value.ui)
  return {
    id: identity.id,
    kind: 'free',
    ui: {
      frame: { ...value.ui.frame },
      isMaximized: value.ui.isMaximized,
      ...(workspace ?? {}),
    },
  }
}

export function sanitizeProjectStates(value: unknown): Record<string, ProjectStateRecord> {
  if (!isObject(value)) return {}
  const states: Record<string, ProjectStateRecord> = {}
  for (const [projectId, entry] of Object.entries(value)) {
    if (!isObject(entry) || !isObject(entry.ui)) continue
    const ui = entry.ui
    if (!isRectangle(ui.frame) || typeof ui.isMaximized !== 'boolean') continue
    states[projectId] = {
      ui: {
        frame: { ...ui.frame },
        isMaximized: ui.isMaximized,
        ...sanitizeProjectUi(ui),
      },
    }
  }
  return states
}

/** Merges a geometry and/or ui patch into one project's persisted state, field by field. */
export function withProjectState(
  states: Record<string, ProjectStateRecord>,
  projectId: string,
  patch: { frame?: WindowFrame; isMaximized?: boolean; ui?: ProjectUiState },
): Record<string, ProjectStateRecord> {
  const previous = states[projectId]?.ui
  return {
    ...states,
    [projectId]: {
      ui: {
        frame: patch.frame ?? previous?.frame ?? { ...FALLBACK_FRAME },
        isMaximized: patch.isMaximized ?? previous?.isMaximized ?? false,
        // The workspace fields travel as one payload: `activeSessionId: null`
        // is a real value (no active tab), not an absent one.
        sessionIds: patch.ui?.sessionIds ?? previous?.sessionIds ?? [],
        activeSessionId:
          patch.ui !== undefined
            ? (patch.ui.activeSessionId ?? null)
            : (previous?.activeSessionId ?? null),
      },
    },
  }
}

export function withoutProjectState(
  states: Record<string, ProjectStateRecord>,
  projectId: string,
): Record<string, ProjectStateRecord> {
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
  const ui = windowsState?.openedWindows.find(
    (entry): entry is StoredFreeWindowState => entry.id === windowId && entry.kind === 'free',
  )?.ui
  if (!ui?.currentWorkspaceKey || !ui.sessionTabsByWorkspace || !ui.activeSessionByWorkspace) {
    return undefined
  }
  return {
    currentWorkspaceKey: ui.currentWorkspaceKey,
    sessionTabsByWorkspace: ui.sessionTabsByWorkspace,
    activeSessionByWorkspace: ui.activeSessionByWorkspace,
  }
}

export function projectWindowEntries(
  windowsState: WindowsState | undefined,
): StoredProjectWindowState[] {
  return (
    windowsState?.openedWindows.filter(
      (entry): entry is StoredProjectWindowState => entry.kind === 'project',
    ) ?? []
  )
}

/** Replaces or removes the workspace payload of one free window's ui, keeping its geometry. */
export function withWindowUiState(
  windowsState: WindowsState | undefined,
  window: { id: string },
  ui: WorkbenchWindowUiState | undefined,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  let openedWindows = base.openedWindows
  if (!openedWindows.some((entry) => entry.id === window.id)) {
    openedWindows = [
      ...openedWindows,
      { id: window.id, kind: 'free', ui: { frame: { ...FALLBACK_FRAME }, isMaximized: false } },
    ]
  }
  return {
    ...base,
    openedWindows: openedWindows.map((entry) => {
      if (entry.id !== window.id || entry.kind !== 'free') return entry
      const next: FreeWindowUi = { ...entry.ui }
      if (ui) {
        next.currentWorkspaceKey = ui.currentWorkspaceKey
        next.sessionTabsByWorkspace = { ...ui.sessionTabsByWorkspace }
        next.activeSessionByWorkspace = { ...ui.activeSessionByWorkspace }
      } else {
        delete next.currentWorkspaceKey
        delete next.sessionTabsByWorkspace
        delete next.activeSessionByWorkspace
      }
      return { ...entry, ui: next }
    }),
  }
}

/** Inserts or refreshes one free window's geometry, keeping its workspace payload. */
export function withFreeWindowEntry(
  windowsState: WindowsState | undefined,
  entry: Pick<WindowSpec, 'id' | 'frame' | 'isMaximized'>,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  const exists = base.openedWindows.some((candidate) => candidate.id === entry.id)
  const geometry = { frame: { ...entry.frame }, isMaximized: entry.isMaximized }
  return {
    lastActiveWindow: entry.id,
    openedWindows: exists
      ? base.openedWindows.map((candidate) =>
          candidate.id === entry.id && candidate.kind === 'free'
            ? { ...candidate, ui: { ...candidate.ui, ...geometry } }
            : candidate,
        )
      : [...base.openedWindows, { id: entry.id, kind: 'free' as const, ui: geometry }],
  }
}

/** Inserts or refreshes a project window's identity record; its state lives in projectState. */
export function withProjectWindowEntry(
  windowsState: WindowsState | undefined,
  entry: StoredProjectWindowState,
): WindowsState {
  const base: WindowsState = windowsState ?? { openedWindows: [] }
  const exists = base.openedWindows.some((candidate) => candidate.id === entry.id)
  return {
    lastActiveWindow: entry.id,
    openedWindows: exists
      ? base.openedWindows.map((candidate) =>
          candidate.id === entry.id && candidate.kind === 'project'
            ? { ...candidate, projectId: entry.projectId }
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

/** The runtime spec for a stored free window, its geometry fitted to the current displays. */
export function fitStoredWindow(
  entry: StoredFreeWindowState,
  displays: WindowDisplay[],
  primaryDisplay: WindowDisplay,
): WindowSpec {
  return {
    id: entry.id,
    kind: 'free',
    frame: fitToDisplays(entry.ui.frame, displays, primaryDisplay),
    isMaximized: entry.ui.isMaximized,
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
): WindowSpec {
  const saved = sanitizeWindowsState(value)
  const freeEntries =
    saved?.openedWindows.filter((entry): entry is StoredFreeWindowState => entry.kind === 'free') ??
    []
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
): WindowSpec {
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
): WindowSpec {
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

export function updateWindowState(previous: WindowSpec, update: WindowStateUpdate): WindowSpec {
  if (update.isFullScreen) return previous
  if (update.isMaximized) return { ...previous, isMaximized: true }
  if (!isRectangle(update.frame)) return previous
  return { ...previous, frame: { ...update.frame }, isMaximized: false }
}
