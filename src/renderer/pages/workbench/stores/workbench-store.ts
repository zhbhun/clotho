import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

import type { ClaudeProject, ClaudeSession } from '@/shared/rpc'
import type { DraftSessionIndex } from '@/shared/session'

import { claude } from '../../../services/claude/claude'
import { getLogger } from '../../../services/logging'
import { UI_STORAGE_KEY } from '../../../services/ui-storage'
import { createWorkbenchUiStorage } from '../services/workbench-ui-storage'
import { DEFAULT_SESSION_TITLE } from '../utils/session-list'

export type ProjectMode = 'project' | 'home'
export type WorkspaceKey = 'claude' | `project:${string}`
export type SessionActivity =
  'idle' | 'processing' | 'awaiting-user' | 'unread-success' | 'unread-error'
export type SessionActivityEvent = 'idle' | 'processing' | 'awaiting-user' | 'success' | 'error'

export interface WorkbenchProject extends ClaudeProject {
  gitBranch?: string | null
}

export interface WorkbenchSession extends ClaudeSession {
  /** Session ID returned by the Claude SDK; null for a new draft before its first send. */
  claudeSessionId: string | null
  /** An input draft that has not been sent and exists only locally. */
  isDraft?: boolean
  /**
   * A blank draft shown for a workspace switch that has not gained content
   * yet: it lives only in memory and is written to ~/.clotho/sessions once
   * it materializes (content + navigate away, tab close, or first send).
   */
  isUnsavedDraft?: boolean
  /** Local drafts use this for activity ordering while created_at stays immutable. */
  updated_at?: number
}

export type WorkbenchCatalog = {
  projects: ClaudeProject[]
  sessions: Record<string, ClaudeSession[]>
  branches: Record<string, string | null>
  drafts?: DraftSessionIndex
}

type WorkbenchDataState = {
  projects: Record<string, WorkbenchProject>
  sessions: Record<string, WorkbenchSession>
  pinnedSessionIds: string[]
  currentWorkspaceKey: WorkspaceKey
  currentProjectId: string | null
  currentSessionId: string | null
  tabsByWorkspace: Record<string, string[]>
  activeSessionByWorkspace: Record<string, string | null>
  projectMode: ProjectMode
  sessionActivity: Record<string, SessionActivity>
}

export type WorkbenchPersistedState = {
  currentWorkspaceKey: WorkspaceKey
  tabsByWorkspace: Record<string, string[]>
  activeSessionByWorkspace: Record<string, string | null>
  pinnedSessionIds: string[]
  unreadSessionActivity: Record<string, 'unread-success' | 'unread-error'>
}

export type WorkbenchState = WorkbenchDataState & {
  setProjectDefaultModel: (
    projectId: string,
    providerId: string | undefined,
    modelId: string | undefined,
  ) => void
  replaceCatalog: (catalog: WorkbenchCatalog) => void
  createDraftSession: (projectId: string | null, title?: string) => string
  touchDraftSession: (sessionId: string) => void
  markSessionStarted: (sessionId: string) => void
  markDraftSaved: (sessionId: string) => void
  markSessionDraft: (sessionId: string) => void
  selectWorkspace: (projectId: string | null) => void
  selectHome: (sessionId: string) => void
  selectProject: (projectId: string, sessionId: string) => void
  selectSession: (sessionId: string) => void
  closeSession: (sessionId: string) => void
  setSessionTitle: (sessionId: string, title: string) => void
  setLocalTitle: (sessionId: string, title: string) => void
  togglePinSession: (sessionId: string) => void
  setSessionActivity: (sessionId: string, activity: SessionActivityEvent) => void
  bindClaudeSession: (sessionId: string, claudeSessionId: string) => void
  removeSession: (sessionId: string) => void
  reset: () => void
}

export function partializeWorkbenchState(state: WorkbenchState): WorkbenchPersistedState {
  const unreadSessionActivity = Object.fromEntries(
    Object.entries(state.sessionActivity).filter(
      ([, activity]) => activity === 'unread-success' || activity === 'unread-error',
    ),
  ) as Record<string, 'unread-success' | 'unread-error'>

  return {
    currentWorkspaceKey: state.currentWorkspaceKey,
    tabsByWorkspace: state.tabsByWorkspace,
    activeSessionByWorkspace: state.activeSessionByWorkspace,
    pinnedSessionIds: state.pinnedSessionIds,
    unreadSessionActivity,
  }
}

function uniqueSessionIds(sessionIds: string[]) {
  return [...new Set(sessionIds)]
}

function putSessionLast(sessionIds: string[], sessionId: string) {
  return sessionIds.includes(sessionId) ? sessionIds : [...sessionIds, sessionId]
}

function removedTabState(
  sessionIds: string[] | undefined,
  removedSessionId: string,
): { sessionIds: string[]; neighborId: string | null } {
  const currentIds = sessionIds ?? []
  const removedIndex = currentIds.indexOf(removedSessionId)
  const remainingIds = currentIds.filter((id) => id !== removedSessionId)
  const neighborId =
    remainingIds[Math.min(Math.max(removedIndex, 0), remainingIds.length - 1)] ?? null
  return { sessionIds: remainingIds, neighborId }
}

export function workspaceKeyForProject(
  project: Pick<WorkbenchProject, 'id' | 'workspace_id'>,
): WorkspaceKey {
  return `project:${project.workspace_id ?? project.id}`
}

function workspaceKeyForSession(
  session: WorkbenchSession,
  projects: Record<string, WorkbenchProject>,
): WorkspaceKey {
  if (!session.project_id) return 'claude'
  const project = projects[session.project_id]
  return project ? workspaceKeyForProject(project) : `project:${session.project_id}`
}

export function workspaceKeyForProjectId(
  projectId: string | null,
  projects: Record<string, WorkbenchProject>,
): WorkspaceKey {
  if (!projectId) return 'claude'
  const project = projects[projectId]
  return project ? workspaceKeyForProject(project) : `project:${projectId}`
}

function reconcileWorkspaceTabs({
  activeSessionByWorkspace = {},
  currentSessionId,
  projects,
  sessions,
  tabsByWorkspace = {},
}: {
  activeSessionByWorkspace?: Record<string, string | null>
  currentSessionId: string | null
  projects: Record<string, WorkbenchProject>
  sessions: Record<string, WorkbenchSession>
  tabsByWorkspace?: Record<string, string[]>
}) {
  const reconciledTabs: Record<string, string[]> = {}
  const sourceSessionIds = uniqueSessionIds([
    ...Object.values(tabsByWorkspace).flat(),
    ...(currentSessionId ? [currentSessionId] : []),
  ])
  for (const sessionId of sourceSessionIds) {
    const session = sessions[sessionId]
    if (!session) continue
    const workspaceKey = workspaceKeyForSession(session, projects)
    reconciledTabs[workspaceKey] = putSessionLast(reconciledTabs[workspaceKey] ?? [], sessionId)
  }

  const reconciledActive: Record<string, string | null> = {}
  for (const [key, sessionId] of Object.entries(activeSessionByWorkspace)) {
    if (sessionId && !sessions[sessionId]) continue
    const workspaceKey = sessionId ? workspaceKeyForSession(sessions[sessionId], projects) : key
    reconciledActive[workspaceKey] = sessionId
  }
  for (const [workspaceKey, sessionIds] of Object.entries(reconciledTabs)) {
    if (!(workspaceKey in reconciledActive)) reconciledActive[workspaceKey] = sessionIds[0] ?? null
  }
  if (currentSessionId && sessions[currentSessionId]) {
    reconciledActive[workspaceKeyForSession(sessions[currentSessionId], projects)] =
      currentSessionId
  }

  return { tabsByWorkspace: reconciledTabs, activeSessionByWorkspace: reconciledActive }
}

function selectedSessionState(
  state: Pick<
    WorkbenchDataState,
    'activeSessionByWorkspace' | 'projects' | 'sessionActivity' | 'tabsByWorkspace'
  >,
  session: WorkbenchSession,
): Pick<
  WorkbenchDataState,
  | 'activeSessionByWorkspace'
  | 'currentProjectId'
  | 'currentSessionId'
  | 'currentWorkspaceKey'
  | 'projectMode'
  | 'sessionActivity'
  | 'tabsByWorkspace'
> {
  const currentActivity = state.sessionActivity[session.id]
  const activity: SessionActivity =
    currentActivity === 'processing' || currentActivity === 'awaiting-user'
      ? currentActivity
      : 'idle'
  const workspaceKey = workspaceKeyForSession(session, state.projects)
  return {
    currentProjectId: session.project_id || null,
    currentSessionId: session.id,
    currentWorkspaceKey: workspaceKey,
    tabsByWorkspace: {
      ...state.tabsByWorkspace,
      [workspaceKey]: putSessionLast(state.tabsByWorkspace[workspaceKey] ?? [], session.id),
    },
    activeSessionByWorkspace: {
      ...state.activeSessionByWorkspace,
      [workspaceKey]: session.id,
    },
    projectMode: session.project_id ? ('project' as const) : ('home' as const),
    sessionActivity: {
      ...state.sessionActivity,
      [session.id]: activity,
    },
  }
}

function createLocalSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createInitialState(): WorkbenchDataState {
  return {
    projects: {},
    sessions: {},
    pinnedSessionIds: [],
    currentWorkspaceKey: 'claude',
    currentProjectId: null,
    currentSessionId: null,
    tabsByWorkspace: {},
    activeSessionByWorkspace: {},
    projectMode: 'home',
    sessionActivity: {},
  }
}

const initialState = createInitialState()

function catalogState(
  current: WorkbenchDataState,
  catalog: WorkbenchCatalog,
): Pick<
  WorkbenchDataState,
  | 'projects'
  | 'sessions'
  | 'currentProjectId'
  | 'currentSessionId'
  | 'currentWorkspaceKey'
  | 'pinnedSessionIds'
  | 'projectMode'
  | 'sessionActivity'
  | 'tabsByWorkspace'
> {
  const existingByClaudeId = new Map<string, WorkbenchSession>()
  for (const session of Object.values(current.sessions)) {
    if (session.claudeSessionId) existingByClaudeId.set(session.claudeSessionId, session)
  }

  const sessions: Record<string, WorkbenchSession> = {}
  const remoteSessionIdsByProject: Record<string, string[]> = {}
  for (const project of catalog.projects) {
    remoteSessionIdsByProject[project.id] = []
    for (const remoteSession of catalog.sessions[project.id] ?? []) {
      const existing = existingByClaudeId.get(remoteSession.id)
      const id = existing?.id ?? remoteSession.id
      const indexedDraft = catalog.drafts?.[id]
      const keepsLocalCardMetadata = Boolean(existing?.custom_title)
      // A session marked started locally stays started: the drafts index in
      // this catalog may be a stale read from before completeLocalDraft
      // landed, and re-flagging it would make the persistence subscriber
      // write the draft entry back.
      const wasStarted = existing?.isDraft === false
      sessions[id] = {
        ...remoteSession,
        ...(keepsLocalCardMetadata && existing
          ? {
              title: existing.title,
              ...(existing.custom_title ? { custom_title: existing.custom_title } : {}),
            }
          : {}),
        id,
        claudeSessionId: remoteSession.id,
        isDraft: wasStarted ? false : Boolean(indexedDraft) || (existing?.isDraft ?? false),
        ...(indexedDraft && !existing ? { title: indexedDraft.title } : {}),
      }
      remoteSessionIdsByProject[project.id].push(id)
    }
  }

  // Drafts are indexed locally and are not present in Claude's session list.
  for (const [id, draft] of Object.entries(catalog.drafts ?? {})) {
    if (sessions[id]) continue
    sessions[id] = {
      id,
      project_id: draft.projectId ?? '',
      project_path: draft.projectPath ?? '',
      created_at: Math.floor(draft.createdAt / 1000),
      updated_at: Math.floor(draft.updatedAt / 1000),
      title: draft.title,
      claudeSessionId: null,
      isDraft: true,
    }
  }

  // Do not discard local drafts or sessions just bound locally but not yet present in the backend catalog.
  for (const session of Object.values(current.sessions)) {
    const isLocallyIdentified =
      session.claudeSessionId === null || session.id !== session.claudeSessionId
    // Home conversations are excluded from every project catalog by session
    // ownership, so the catalog can never restore them; keep them even when
    // their local id already is the Claude session id.
    const isCatalogRecoverable = Boolean(session.project_id)
    if ((!isLocallyIdentified && isCatalogRecoverable) || sessions[session.id]) continue

    sessions[session.id] = session
  }

  const projects = Object.fromEntries(
    catalog.projects.map((project) => {
      const catalogSessionIds = remoteSessionIdsByProject[project.id] ?? []
      const localSessionIds = Object.values(sessions)
        .filter(
          (session) => session.project_id === project.id && !catalogSessionIds.includes(session.id),
        )
        .map((session) => session.id)
      return [
        project.id,
        {
          ...project,
          sessions: [...catalogSessionIds, ...localSessionIds],
          gitBranch: catalog.branches[project.id] ?? null,
        } satisfies WorkbenchProject,
      ]
    }),
  )

  const catalogCurrentSessionId =
    current.currentSessionId && sessions[current.currentSessionId] ? current.currentSessionId : null
  const workspaceTabs = reconcileWorkspaceTabs({
    activeSessionByWorkspace: current.activeSessionByWorkspace,
    currentSessionId: catalogCurrentSessionId,
    projects,
    sessions,
    tabsByWorkspace: current.tabsByWorkspace,
  })
  const catalogCurrentSession = catalogCurrentSessionId
    ? sessions[catalogCurrentSessionId]
    : undefined
  const runtimeProject = current.currentProjectId ? projects[current.currentProjectId] : undefined
  const preferredWorkspaceKey = catalogCurrentSession
    ? workspaceKeyForSession(catalogCurrentSession, projects)
    : runtimeProject
      ? workspaceKeyForProject(runtimeProject)
      : current.currentWorkspaceKey
  const restoredProject = Object.values(projects).find(
    (project) => workspaceKeyForProject(project) === preferredWorkspaceKey,
  )
  const currentWorkspaceKey: WorkspaceKey =
    preferredWorkspaceKey === 'claude' || restoredProject ? preferredWorkspaceKey : 'claude'
  const activeSessionId = workspaceTabs.activeSessionByWorkspace[currentWorkspaceKey] ?? null
  const currentSessionId = activeSessionId && sessions[activeSessionId] ? activeSessionId : null
  const currentSession = currentSessionId ? sessions[currentSessionId] : undefined
  const currentProjectId = currentSession
    ? currentSession.project_id || null
    : (restoredProject?.id ?? null)
  const sessionActivity = Object.fromEntries(
    Object.entries(current.sessionActivity).filter(([sessionId]) => sessions[sessionId]),
  )

  return {
    projects,
    sessions,
    pinnedSessionIds: current.pinnedSessionIds.filter((sessionId) => sessions[sessionId]),
    currentProjectId,
    currentSessionId,
    currentWorkspaceKey,
    ...workspaceTabs,
    projectMode: currentProjectId ? 'project' : 'home',
    sessionActivity,
  }
}

function buildDraftSession(
  id: string,
  projectId: string | null,
  title: string,
  projects: Record<string, WorkbenchProject>,
): WorkbenchSession {
  const project = projectId ? projects[projectId] : undefined
  const now = Math.floor(Date.now() / 1000)
  return {
    id,
    claudeSessionId: null,
    project_id: projectId ?? '',
    project_path: project?.path ?? '',
    created_at: now,
    updated_at: now,
    title,
    isDraft: true,
    isUnsavedDraft: true,
  }
}

function addedSessionState(
  state: Pick<WorkbenchDataState, 'projects' | 'sessionActivity' | 'sessions' | 'tabsByWorkspace'>,
  session: WorkbenchSession,
): Pick<WorkbenchDataState, 'projects' | 'sessionActivity' | 'sessions' | 'tabsByWorkspace'> {
  const workspaceKey = workspaceKeyForSession(session, state.projects)
  const project = session.project_id ? state.projects[session.project_id] : undefined
  return {
    sessions: { ...state.sessions, [session.id]: session },
    tabsByWorkspace: {
      ...state.tabsByWorkspace,
      [workspaceKey]: putSessionLast(state.tabsByWorkspace[workspaceKey] ?? [], session.id),
    },
    sessionActivity: { ...state.sessionActivity, [session.id]: 'idle' },
    projects:
      session.project_id && project
        ? {
            ...state.projects,
            [session.project_id]: {
              ...project,
              sessions: project.sessions.includes(session.id)
                ? project.sessions
                : [session.id, ...project.sessions],
            },
          }
        : state.projects,
  }
}

export const useWorkbenchStore = create<WorkbenchState>()(
  persist(
    (set, get) => ({
      ...initialState,
      setProjectDefaultModel: (projectId, providerId, modelId) =>
        set((state) => {
          const project = state.projects[projectId]
          if (!project) return state
          return {
            projects: {
              ...state.projects,
              [projectId]: {
                ...project,
                default_provider_id: providerId,
                default_model_id: modelId,
              },
            },
          }
        }),
      replaceCatalog: (catalog) =>
        set((state) => ({
          ...catalogState(state, catalog),
        })),
      createDraftSession: (projectId, title = DEFAULT_SESSION_TITLE) => {
        const id = createLocalSessionId()
        set((state) =>
          addedSessionState(state, buildDraftSession(id, projectId, title, state.projects)),
        )
        return id
      },
      touchDraftSession: (sessionId) => {
        const session = get().sessions[sessionId]
        const editedAt = Math.floor(Date.now() / 1000)
        if (!session?.isDraft || session.updated_at === editedAt) return
        set((state) => {
          const current = state.sessions[sessionId]
          if (!current?.isDraft || current.updated_at === editedAt) return state
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...current, updated_at: editedAt },
            },
          }
        })
      },
      markSessionStarted: (sessionId) =>
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session || session.isDraft === false) return state
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, isDraft: false, isUnsavedDraft: false },
            },
          }
        }),
      markDraftSaved: (sessionId) =>
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session?.isUnsavedDraft) return state
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, isUnsavedDraft: false },
            },
          }
        }),
      markSessionDraft: (sessionId) =>
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session || session.isDraft === true) return state
          return { sessions: { ...state.sessions, [sessionId]: { ...session, isDraft: true } } }
        }),
      selectWorkspace: (projectId) =>
        set((state) => {
          const validProjectId = projectId && state.projects[projectId] ? projectId : null
          const workspaceKey = workspaceKeyForProjectId(validProjectId, state.projects)
          const activeSessionId = state.activeSessionByWorkspace[workspaceKey]
          const firstTabId = state.tabsByWorkspace[workspaceKey]?.[0]
          const sessionId = activeSessionId === undefined ? firstTabId : activeSessionId
          const session = sessionId ? state.sessions[sessionId] : undefined

          if (session) return selectedSessionState(state, session)

          return {
            currentProjectId: validProjectId,
            currentSessionId: null,
            currentWorkspaceKey: workspaceKey,
            projectMode: validProjectId ? ('project' as const) : ('home' as const),
          }
        }),
      selectHome: (currentSessionId) =>
        set((state) => {
          const session = state.sessions[currentSessionId]
          return session ? selectedSessionState(state, session) : state
        }),
      selectProject: (_currentProjectId, currentSessionId) =>
        set((state) => {
          const session = state.sessions[currentSessionId]
          return session ? selectedSessionState(state, session) : state
        }),
      selectSession: (currentSessionId) =>
        set((state) => {
          const session = state.sessions[currentSessionId]
          if (!session) return state
          return selectedSessionState(state, session)
        }),
      closeSession: (sessionId) =>
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session) return state
          const workspaceKey = workspaceKeyForSession(session, state.projects)
          const { sessionIds: workspaceTabs, neighborId } = removedTabState(
            state.tabsByWorkspace[workspaceKey],
            sessionId,
          )
          const sessionActivity =
            state.sessionActivity[sessionId] === 'processing' ||
            state.sessionActivity[sessionId] === 'awaiting-user'
              ? { ...state.sessionActivity, [sessionId]: 'idle' as const }
              : state.sessionActivity
          const tabsByWorkspace = {
            ...state.tabsByWorkspace,
            [workspaceKey]: workspaceTabs,
          }
          const wasWorkspaceActive = state.activeSessionByWorkspace[workspaceKey] === sessionId
          const activeSessionByWorkspace = wasWorkspaceActive
            ? { ...state.activeSessionByWorkspace, [workspaceKey]: neighborId }
            : state.activeSessionByWorkspace
          const base = {
            activeSessionByWorkspace,
            sessionActivity,
            tabsByWorkspace,
          }
          if (state.currentSessionId !== sessionId) return base

          const nextSession = neighborId ? state.sessions[neighborId] : undefined
          if (nextSession) {
            return selectedSessionState({ ...state, ...base }, nextSession)
          }

          // The workspace's last tab closed: land on a fresh blank new-chat
          // draft instead of a dead surface, matching the startup state. It
          // stays in memory until it gains content.
          const draft = buildDraftSession(
            createLocalSessionId(),
            session.project_id || null,
            DEFAULT_SESSION_TITLE,
            state.projects,
          )
          const withDraft = addedSessionState({ ...state, ...base }, draft)
          return {
            ...base,
            ...withDraft,
            ...selectedSessionState({ ...state, ...withDraft }, draft),
          }
        }),
      setSessionTitle: (sessionId, title) =>
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session) return state
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, custom_title: title, title },
            },
          }
        }),
      // Derived titles must not touch custom_title: a session with one keeps its
      // local title across catalog refreshes, which would pin the placeholder
      // over the title the SDK later returns for a started session.
      setLocalTitle: (sessionId, title) =>
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session) return state
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: { ...session, title },
            },
          }
        }),
      togglePinSession: (sessionId) =>
        set((state) => {
          if (!state.sessions[sessionId]) return state
          return {
            pinnedSessionIds: state.pinnedSessionIds.includes(sessionId)
              ? state.pinnedSessionIds.filter((id) => id !== sessionId)
              : [...state.pinnedSessionIds, sessionId],
          }
        }),
      setSessionActivity: (sessionId, activity) =>
        set((state) => {
          if (!state.sessions[sessionId]) return state
          let next: SessionActivity
          if (activity === 'processing') next = 'processing'
          else if (activity === 'awaiting-user') next = 'awaiting-user'
          else if (activity === 'success') {
            next = state.currentSessionId === sessionId ? 'idle' : 'unread-success'
          } else if (activity === 'error') {
            next = state.currentSessionId === sessionId ? 'idle' : 'unread-error'
          } else next = 'idle'

          return { sessionActivity: { ...state.sessionActivity, [sessionId]: next } }
        }),
      bindClaudeSession: (sessionId, claudeSessionId) => {
        const bound = get().sessions[sessionId]
        set((state) => {
          const session = state.sessions[sessionId]
          if (!session || session.claudeSessionId === claudeSessionId) return state
          const duplicateIds = Object.values(state.sessions)
            .filter(
              (candidate) =>
                candidate.id !== sessionId && candidate.claudeSessionId === claudeSessionId,
            )
            .map((candidate) => candidate.id)
          const sessions = {
            ...state.sessions,
            [sessionId]: { ...session, claudeSessionId },
          }
          for (const duplicateId of duplicateIds) delete sessions[duplicateId]
          const replaceDuplicate = (id: string) => (duplicateIds.includes(id) ? sessionId : id)
          return {
            sessions,
            projects: Object.fromEntries(
              Object.entries(state.projects).map(([id, project]) => [
                id,
                { ...project, sessions: [...new Set(project.sessions.map(replaceDuplicate))] },
              ]),
            ),
            tabsByWorkspace: Object.fromEntries(
              Object.entries(state.tabsByWorkspace).map(([key, ids]) => [
                key,
                [...new Set(ids.map(replaceDuplicate))],
              ]),
            ),
            pinnedSessionIds: state.pinnedSessionIds
              .map(replaceDuplicate)
              .filter((id, index, ids) => ids.indexOf(id) === index),
            currentSessionId: duplicateIds.includes(state.currentSessionId ?? '')
              ? sessionId
              : state.currentSessionId,
            activeSessionByWorkspace: Object.fromEntries(
              Object.entries(state.activeSessionByWorkspace).map(([key, id]) => [
                key,
                duplicateIds.includes(id ?? '') ? sessionId : id,
              ]),
            ),
          }
        })
        // Pin the conversation to its project entry so folder / workspace
        // entries of one directory keep separate histories.
        void claude
          .bindSessionOwner({
            sessionId,
            claudeSessionId,
            projectId: bound?.project_id || null,
          })
          .catch((error) =>
            getLogger('persistence').error(
              'session.ownership_write_failed',
              'Failed to record the session owner',
              { error },
            ),
          )
      },
      removeSession: (sessionId) =>
        set((state) => {
          const removedSession = state.sessions[sessionId]
          if (!removedSession) return state
          const sessions = { ...state.sessions }
          delete sessions[sessionId]
          const workspaceKey = workspaceKeyForSession(removedSession, state.projects)
          const { sessionIds: workspaceTabs, neighborId } = removedTabState(
            state.tabsByWorkspace[workspaceKey],
            sessionId,
          )
          const tabsByWorkspace = {
            ...state.tabsByWorkspace,
            [workspaceKey]: workspaceTabs,
          }
          const activeSessionByWorkspace =
            state.activeSessionByWorkspace[workspaceKey] === sessionId
              ? { ...state.activeSessionByWorkspace, [workspaceKey]: neighborId }
              : state.activeSessionByWorkspace
          const sessionActivity = Object.fromEntries(
            Object.entries(state.sessionActivity).filter(([id]) => id !== sessionId),
          )
          const projects = Object.fromEntries(
            Object.entries(state.projects).map(([id, project]) => [
              id,
              { ...project, sessions: project.sessions.filter((item) => item !== sessionId) },
            ]),
          )
          const base = {
            sessions,
            projects,
            activeSessionByWorkspace,
            pinnedSessionIds: state.pinnedSessionIds.filter((id) => id !== sessionId),
            sessionActivity,
            tabsByWorkspace,
          }
          if (state.currentSessionId !== sessionId) return base

          const nextSession = neighborId ? sessions[neighborId] : undefined
          if (nextSession) {
            return {
              ...base,
              ...selectedSessionState({ ...state, ...base }, nextSession),
            }
          }

          // Same as closeSession: removing the workspace's last session keeps
          // an empty conversation surface through a fresh blank draft.
          const draft = buildDraftSession(
            createLocalSessionId(),
            removedSession.project_id || null,
            DEFAULT_SESSION_TITLE,
            state.projects,
          )
          const withDraft = addedSessionState({ ...state, ...base }, draft)
          return {
            ...base,
            ...withDraft,
            ...selectedSessionState({ ...state, ...withDraft }, draft),
          }
        }),
      reset: () => set(createInitialState()),
    }),
    {
      name: UI_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(createWorkbenchUiStorage),
      partialize: partializeWorkbenchState,
      merge: (persisted, current) => {
        const restored = persisted as Partial<WorkbenchPersistedState>
        return {
          ...current,
          currentWorkspaceKey: restored.currentWorkspaceKey ?? 'claude',
          tabsByWorkspace: restored.tabsByWorkspace ?? {},
          activeSessionByWorkspace: restored.activeSessionByWorkspace ?? {},
          pinnedSessionIds: restored.pinnedSessionIds ?? [],
          sessionActivity: restored.unreadSessionActivity ?? {},
        }
      },
    },
  ),
)
