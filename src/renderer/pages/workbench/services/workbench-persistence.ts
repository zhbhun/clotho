import type { ProjectUiState, WindowDescription, WorkbenchWindowUiState } from '@/shared/rpc'

import { claude } from '../../../services/claude/claude'
import { getLogger } from '../../../services/logging'
import {
  type SessionActivity,
  useWorkbenchStore,
  windowUiState,
  workspaceUiState,
} from '../stores/workbench-store'

const WINDOW_UI_DEBOUNCE_MS = 250

/** A window that cannot learn its identity persists as a free window. */
const FALLBACK_IDENTITY: WindowDescription = {
  id: 'unknown',
  kind: 'free',
  projectId: null,
  pinnedProjectIds: [],
}

export interface WorkbenchPersistenceOptions {
  describeWindow?: () => Promise<WindowDescription>
  readWindowUi?: () => Promise<WorkbenchWindowUiState | undefined>
  writeWindowUi?: (ui: WorkbenchWindowUiState) => Promise<void>
  readProjectUi?: (projectId: string) => Promise<ProjectUiState | null>
  writeProjectUi?: (ui: ProjectUiState) => Promise<void>
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
 * Keeps the desktop storage as the durable home of the workbench state: a
 * free window's workspaces ride its window entry, a project window's tabs
 * ride its project's state, and unread marks sync to the session index as
 * they change.
 */
export function startWorkbenchPersistence(options: WorkbenchPersistenceOptions = {}) {
  const describeWindow = options.describeWindow ?? (() => claude.describeWindow())
  const readWindowUi = options.readWindowUi ?? (() => claude.readWindowUiState())
  const writeWindowUi = options.writeWindowUi ?? ((ui) => claude.writeWindowUiState(ui))
  const readProjectUi =
    options.readProjectUi ??
    ((projectId: string) => claude.readProjectState(projectId).then((stored) => stored?.ui ?? null))
  const writeProjectUi = options.writeProjectUi ?? ((ui) => claude.writeProjectState(ui))
  const setSessionsUnread =
    options.setSessionsUnread ??
    ((sessions, unread) => claude.setSessionsUnread({ sessions, unread }))
  const debounceMs = options.debounceMs ?? WINDOW_UI_DEBOUNCE_MS
  const logger = getLogger('persistence')

  // Which document the ui goes to depends on the window kind; a write asked
  // for before the identity is known waits for it.
  let identity: WindowDescription | undefined
  let hasPendingWrite = false
  const writeUi = () => {
    if (!identity) {
      hasPendingWrite = true
      return
    }
    const state = useWorkbenchStore.getState()
    const projectId = identity.kind === 'project' ? identity.projectId : null
    // A project workspace keyed before the catalog landed reads as empty and
    // would wipe the stored tabs; the next change writes it.
    if (projectId && !state.projects[projectId]) return
    const request = projectId
      ? writeProjectUi(workspaceUiState(state, projectId))
      : writeWindowUi(windowUiState(state))
    request.catch((error) =>
      logger.error('window_ui.write_failed', 'Failed to save the window ui state', { error }),
    )
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  const scheduleWindowUiWrite = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      writeUi()
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

  const restore = async () => {
    identity = await describeWindow().catch(() => FALLBACK_IDENTITY)
    const projectId = identity.kind === 'project' ? identity.projectId : null
    if (projectId) {
      const ui = await readProjectUi(projectId)
      if (ui) useWorkbenchStore.getState().restoreProjectWorkspace(projectId, ui)
      return
    }
    const ui = await readWindowUi()
    if (!ui) return
    useWorkbenchStore.setState((state) => ({
      ...state,
      currentWorkspaceKey: ui.currentWorkspaceKey,
      sessionTabsByWorkspace: ui.sessionTabsByWorkspace,
      activeSessionByWorkspace: ui.activeSessionByWorkspace,
    }))
    // Restore the active session of the restored workspace so the window comes
    // back showing it (and titling itself by it) instead of a blank home draft.
    if (!useWorkbenchStore.getState().currentSessionId) {
      const key = ui.currentWorkspaceKey
      const sessionId = ui.activeSessionByWorkspace[key] ?? ui.sessionTabsByWorkspace[key]?.at(-1)
      if (sessionId) useWorkbenchStore.getState().selectSession(sessionId)
    }
  }

  const ready = restore()
    .catch((error) => {
      logger.warning('window_ui.read_failed', 'Failed to restore the window ui state', { error })
    })
    .then(() => {
      if (!hasPendingWrite) return
      hasPendingWrite = false
      scheduleWindowUiWrite()
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
