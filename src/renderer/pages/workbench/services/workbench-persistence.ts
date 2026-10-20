import { claude } from '../../../services/claude/claude'
import { getLogger } from '../../../services/logging'
import {
  type SessionActivity,
  type WorkspaceKey,
  useWorkbenchStore,
  windowUiState,
} from '../stores/workbench-store'

const WINDOW_UI_DEBOUNCE_MS = 250

type WindowUiPayload = {
  currentWorkspaceKey?: WorkspaceKey
  sessionTabsByWorkspace?: Record<string, string[]>
  activeSessionByWorkspace?: Record<string, string | null>
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...new Set(value)]
    : undefined
}

function stringArrayRecord(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const values = stringArray(item)
    return values ? [[key, values] as const] : []
  })
  return Object.fromEntries(entries)
}

function nullableStringRecord(value: unknown): Record<string, string | null> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      item === null || typeof item === 'string' ? [[key, item] as const] : [],
    ),
  )
}

function windowUiPayload(value: Record<string, unknown>): WindowUiPayload {
  const sessionTabsByWorkspace = stringArrayRecord(value.sessionTabsByWorkspace)
  const activeSessionByWorkspace = nullableStringRecord(value.activeSessionByWorkspace)
  return {
    ...(typeof value.currentWorkspaceKey === 'string'
      ? { currentWorkspaceKey: value.currentWorkspaceKey as WorkspaceKey }
      : {}),
    ...(sessionTabsByWorkspace ? { sessionTabsByWorkspace } : {}),
    ...(activeSessionByWorkspace ? { activeSessionByWorkspace } : {}),
  }
}

export interface WorkbenchPersistenceOptions {
  readWindowUi?: () => Promise<Record<string, unknown> | undefined>
  writeWindowUi?: (ui: Record<string, unknown>) => Promise<void>
  setSessionsUnread?: (
    sessions: Array<{
      projectId: string | null
      sessionId: string
      claudeSessionId: string | null
    }>,
    unread: 'success' | 'error' | null,
  ) => Promise<void>
  debounceMs?: number
}

/**
 * Keeps the desktop storage as the durable home of the workbench state:
 * window-scoped fields ride the window entry and unread marks sync to the
 * session index as they change.
 */
export function startWorkbenchPersistence(options: WorkbenchPersistenceOptions = {}) {
  const readWindowUi = options.readWindowUi ?? (() => claude.readWindowUiState())
  const writeWindowUi = options.writeWindowUi ?? ((ui) => claude.writeWindowUiState(ui))
  const setSessionsUnread =
    options.setSessionsUnread ??
    ((sessions, unread) => claude.setSessionsUnread({ sessions, unread }))
  const debounceMs = options.debounceMs ?? WINDOW_UI_DEBOUNCE_MS
  const logger = getLogger('persistence')

  let timer: ReturnType<typeof setTimeout> | undefined
  const scheduleWindowUiWrite = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      writeWindowUi(windowUiState(useWorkbenchStore.getState())).catch((error) =>
        logger.error('window_ui.write_failed', 'Failed to save the window ui state', { error }),
      )
    }, debounceMs)
  }

  let previousActivity: Record<string, SessionActivity> =
    useWorkbenchStore.getState().sessionActivity
  let previousSessions = useWorkbenchStore.getState().sessions
  const syncUnreadMark = (sessionId: string, activity: SessionActivity) => {
    const session = useWorkbenchStore.getState().sessions[sessionId]
    if (!session) return
    const unread =
      activity === 'unread-success' ? 'success' : activity === 'unread-error' ? 'error' : null
    setSessionsUnread(
      [
        {
          projectId: session.project_id || null,
          sessionId: session.id,
          claudeSessionId: session.claudeSessionId,
        },
      ],
      unread,
    ).catch((error) =>
      logger.error('session.unread_write_failed', 'Failed to record the unread mark', { error }),
    )
  }

  const unsubscribe = useWorkbenchStore.subscribe((state) => {
    for (const [sessionId, next] of Object.entries(state.sessionActivity)) {
      const previous = previousActivity[sessionId]
      if (previous === next) continue
      // An entry that appears together with a new catalog session is a seed
      // from the session index; only transitions of sessions the runtime
      // already knew about need to be written back.
      if (previous === undefined && previousSessions[sessionId] === undefined) continue
      syncUnreadMark(sessionId, next)
    }
    previousActivity = state.sessionActivity
    previousSessions = state.sessions

    scheduleWindowUiWrite()
  })

  const ready = readWindowUi()
    .then((ui) => {
      if (!ui) return
      const restored = windowUiPayload(ui)
      if (Object.keys(restored).length === 0) return
      useWorkbenchStore.setState((state) => ({ ...state, ...restored }))
    })
    .catch((error) => {
      logger.warning('window_ui.read_failed', 'Failed to restore the window ui state', { error })
    })

  return {
    ready,
    stop: () => {
      if (timer !== undefined) clearTimeout(timer)
      unsubscribe()
    },
  }
}

let singleton: { ready: Promise<void>; stop: () => void } | undefined

/** The workbench-wide instance, started on first use by the workbench page. */
export function workbenchPersistence() {
  if (!singleton) singleton = startWorkbenchPersistence()
  return singleton
}
