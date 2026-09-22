import { type KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ClaudeSession } from '@/shared/rpc'

import { claude } from '../../../services/claude/claude'
import { MOCK_PROJECT_ID } from '../../../services/claude/mock/project'
import type { SessionControllerRegistry } from '../session/session-controller-registry'
import type { SessionError } from '../session/stores/runtime-store'
import { createProjectModelSaveQueue } from '../stores/project-model-save'
import {
  type WorkbenchSession,
  useWorkbenchStore,
  workspaceKeyForProject,
} from '../stores/workbench-store'
import { buildSessionTimeline, pickOpenOrPinnedSessions } from '../utils/session-list'
import { useSessionActions } from './use-session-actions'

export type SessionSidebarTab = 'current' | 'history'

const DEV_MOCK_PROJECT_ID = import.meta.env.DEV ? MOCK_PROJECT_ID : undefined
const HIDDEN_SIDEBAR_PROJECT_IDS = new Set(
  import.meta.env.DEV && DEV_MOCK_PROJECT_ID ? [DEV_MOCK_PROJECT_ID] : [],
)
const ignoreSessionError = () => {}

function existingRemoteSessions(projectId: string): ClaudeSession[] {
  return Object.values(useWorkbenchStore.getState().sessions).flatMap((session) => {
    if (
      session.project_id !== projectId ||
      !session.claudeSessionId ||
      session.id !== session.claudeSessionId ||
      session.isDraft
    ) {
      return []
    }

    return [session]
  })
}

export function useProjects(
  onSessionError: (sessionId: string, error: SessionError | null) => void = ignoreSessionError,
  controllerRegistry?: Pick<SessionControllerRegistry, 'find' | 'release'>,
) {
  const { i18n, t } = useTranslation()
  const releaseSessionController = useCallback(
    (sessionId: string) => controllerRegistry?.release(sessionId) ?? Promise.resolve(),
    [controllerRegistry],
  )
  const projectMap = useWorkbenchStore((state) => state.projects)
  const sessionMap = useWorkbenchStore((state) => state.sessions)
  const currentProjectId = useWorkbenchStore((state) => state.currentProjectId)
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId)
  const tabsByWorkspace = useWorkbenchStore((state) => state.tabsByWorkspace)
  const projectMode = useWorkbenchStore((state) => state.projectMode)
  const sessionActivity = useWorkbenchStore((state) => state.sessionActivity)
  const pinnedSessionIds = useWorkbenchStore((state) => state.pinnedSessionIds)
  const replaceCatalog = useWorkbenchStore((state) => state.replaceCatalog)
  const createDraftSession = useWorkbenchStore((state) => state.createDraftSession)
  const selectWorkspaceState = useWorkbenchStore((state) => state.selectWorkspace)
  const selectSessionState = useWorkbenchStore((state) => state.selectSession)
  const closeSessionState = useWorkbenchStore((state) => state.closeSession)
  const setSessionActivity = useWorkbenchStore((state) => state.setSessionActivity)
  const bindClaudeSession = useWorkbenchStore((state) => state.bindClaudeSession)
  const removeSession = useWorkbenchStore((state) => state.removeSession)
  const setSessionTitle = useWorkbenchStore((state) => state.setSessionTitle)
  const togglePinSessionState = useWorkbenchStore((state) => state.togglePinSession)
  const setProjectDefaultModelState = useWorkbenchStore((state) => state.setProjectDefaultModel)

  const [focusSessionId, setFocusSessionId] = useState<string | null>(currentSessionId)
  const [activeTab, setActiveTab] = useState<SessionSidebarTab>('current')
  const [focusNavigationRevision, setFocusNavigationRevision] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLoadedCatalog, setHasLoadedCatalog] = useState(false)
  const [projectListError, setProjectListError] = useState<string | null>(null)
  const [projectSessionErrors, setProjectSessionErrors] = useState<Record<string, string>>({})
  const [loadingProjectSessionIds, setLoadingProjectSessionIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const refreshRequestIdRef = useRef(0)
  const initializedWorkspaceDraftsRef = useRef(new Set<string>())

  const projects = useMemo(() => Object.values(projectMap), [projectMap])
  const pinnedSessionIdSet = useMemo(() => new Set(pinnedSessionIds), [pinnedSessionIds])
  const sessionTimeline = useMemo(
    () =>
      buildSessionTimeline({
        hiddenProjectIds: HIDDEN_SIDEBAR_PROJECT_IDS,
        locale: i18n.resolvedLanguage ?? i18n.language,
        pinnedSessionIds: pinnedSessionIdSet,
        projects: projectMap,
        sessionActivity,
        sessions: sessionMap,
        t,
      }),
    [
      i18n.language,
      i18n.resolvedLanguage,
      pinnedSessionIdSet,
      projectMap,
      sessionActivity,
      sessionMap,
      t,
    ],
  )
  // The "current" tab shows sessions open in any workspace tab plus the pinned ones,
  // grouped by the same date timeline as the "history" tab.
  const workSessions = useMemo(
    () =>
      pickOpenOrPinnedSessions({
        openSessionIds: Object.values(tabsByWorkspace).flat(),
        pinnedSessionIds: pinnedSessionIdSet,
        sessions: sessionMap,
      }),
    [pinnedSessionIdSet, sessionMap, tabsByWorkspace],
  )
  const workTimeline = useMemo(
    () =>
      buildSessionTimeline({
        hiddenProjectIds: HIDDEN_SIDEBAR_PROJECT_IDS,
        locale: i18n.resolvedLanguage ?? i18n.language,
        pinnedSessionIds: pinnedSessionIdSet,
        projects: projectMap,
        sessionActivity,
        sessions: workSessions,
        t,
      }),
    [
      i18n.language,
      i18n.resolvedLanguage,
      pinnedSessionIdSet,
      projectMap,
      sessionActivity,
      workSessions,
      t,
    ],
  )
  const activeTimeline = activeTab === 'current' ? workTimeline : sessionTimeline
  const sessionList = useMemo(
    () => activeTimeline.flatMap((group) => group.sessions),
    [activeTimeline],
  )
  const requestedFocusIndex = focusSessionId
    ? sessionList.findIndex((item) => item.session.id === focusSessionId)
    : -1
  const focusedIndex = requestedFocusIndex >= 0 ? requestedFocusIndex : 0
  const focusedSessionId = sessionList[focusedIndex]?.session.id ?? null
  const selectedProject = currentProjectId ? projectMap[currentProjectId] : undefined
  const selectedSession = currentSessionId ? (sessionMap[currentSessionId] ?? null) : null
  const currentWorkspaceKey = selectedProject ? workspaceKeyForProject(selectedProject) : 'claude'
  const tabSessions = useMemo(
    () =>
      (tabsByWorkspace[currentWorkspaceKey] ?? []).flatMap((sessionId) => {
        const session = sessionMap[sessionId]
        // A blank unsaved draft is the open new-chat surface itself; it only
        // joins the tab bar once it becomes a stored draft or real session.
        return session && !session.isUnsavedDraft ? [session] : []
      }),
    [currentWorkspaceKey, sessionMap, tabsByWorkspace],
  )
  const workspaceSessions = useMemo(
    () =>
      Object.values(sessionMap)
        .filter((session) =>
          currentProjectId
            ? session.project_id === currentProjectId && !session.isUnsavedDraft
            : !session.project_id && !session.isUnsavedDraft,
        )
        .toSorted(
          (left, right) =>
            (right.updated_at ?? right.created_at) - (left.updated_at ?? left.created_at) ||
            left.id.localeCompare(right.id),
        ),
    [currentProjectId, sessionMap],
  )
  const tabSessionIds = useMemo(
    () => [...new Set(Object.values(tabsByWorkspace).flat())].filter((id) => sessionMap[id]),
    [sessionMap, tabsByWorkspace],
  )
  const projectModelSaveQueue = useMemo(
    () =>
      createProjectModelSaveQueue({
        getModel: (projectId) => {
          const project = useWorkbenchStore.getState().projects[projectId]
          return {
            providerId: project?.default_provider_id,
            modelId: project?.default_model_id,
          }
        },
        setModel: (projectId, selection) =>
          setProjectDefaultModelState(projectId, selection.providerId, selection.modelId),
        saveModel: (projectId, providerId, modelId) =>
          claude.setProjectModel({ projectId, providerId, modelId }),
      }),
    [setProjectDefaultModelState],
  )
  const saveProjectDefaultModel = useCallback(
    (projectId: string, providerId: string, modelId: string) => {
      void projectModelSaveQueue.save(projectId, providerId, modelId)
    },
    [projectModelSaveQueue],
  )

  const ensureInitialSession = useCallback(
    (sessionErrors: Record<string, string>) => {
      const state = useWorkbenchStore.getState()
      if (state.currentSessionId) return
      const workspaceKey = state.currentWorkspaceKey
      if (initializedWorkspaceDraftsRef.current.has(workspaceKey)) return
      if (state.currentProjectId && sessionErrors[state.currentProjectId]) return
      initializedWorkspaceDraftsRef.current.add(workspaceKey)

      const candidates = Object.values(state.sessions)
        .filter((session) =>
          state.currentProjectId
            ? session.project_id === state.currentProjectId
            : !session.project_id,
        )
        .toSorted(
          (left, right) =>
            (right.updated_at ?? right.created_at) - (left.updated_at ?? left.created_at) ||
            left.id.localeCompare(right.id),
        )
      const existing = candidates[0]
      if (existing) {
        selectSessionState(existing.id)
        return
      }

      const sessionId = createDraftSession(state.currentProjectId)
      const draft = useWorkbenchStore.getState().sessions[sessionId]
      if (!draft) return
      // The initial blank session stays in memory until it gains content.
      selectSessionState(sessionId)
    },
    [createDraftSession, selectSessionState],
  )

  const refreshProjects = useCallback(async () => {
    const requestId = refreshRequestIdRef.current + 1
    refreshRequestIdRef.current = requestId
    setIsLoading(true)
    setProjectListError(null)
    setLoadingProjectSessionIds(new Set(Object.keys(useWorkbenchStore.getState().projects)))

    try {
      const projects = await claude.listProjects()
      if (requestId !== refreshRequestIdRef.current) return
      setLoadingProjectSessionIds(new Set(projects.map((project) => project.id)))
      const [sessionResults, branchEntries, drafts] = await Promise.all([
        Promise.all(
          projects.map(async (project) => {
            try {
              return {
                error: null,
                projectId: project.id,
                sessions: await claude.getProjectSessions(project.id),
              }
            } catch (caught) {
              return {
                error:
                  caught instanceof Error
                    ? caught.message
                    : 'Failed to load sessions for this project',
                projectId: project.id,
                sessions: existingRemoteSessions(project.id),
              }
            }
          }),
        ),
        Promise.all(
          projects.map(async (project) => {
            try {
              return [project.id, await claude.getProjectGitBranch(project.path)] as const
            } catch {
              return [project.id, null] as const
            }
          }),
        ),
        claude.listDraftSessions().catch(() => ({})),
      ])
      if (requestId !== refreshRequestIdRef.current) return
      const projectSessionErrors = Object.fromEntries(
        sessionResults.flatMap((result) =>
          result.error ? [[result.projectId, result.error] as const] : [],
        ),
      )
      replaceCatalog({
        projects,
        sessions: Object.fromEntries(
          sessionResults.map((result) => [result.projectId, result.sessions]),
        ),
        branches: Object.fromEntries(branchEntries),
        drafts,
      })
      ensureInitialSession(projectSessionErrors)
      setProjectSessionErrors(projectSessionErrors)
      setHasLoadedCatalog(true)
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error('Failed to load Claude projects')
      if (requestId === refreshRequestIdRef.current) setProjectListError(error.message)
      throw error
    } finally {
      if (requestId === refreshRequestIdRef.current) {
        setLoadingProjectSessionIds(new Set())
        setIsLoading(false)
      }
    }
  }, [ensureInitialSession, replaceCatalog])

  useEffect(() => {
    void refreshProjects().catch(() => {})
  }, [refreshProjects])

  const selectProject = useCallback(
    (projectId: string | null) => {
      selectWorkspaceState(projectId)
      if (projectId) void claude.setProjectLastOpened(projectId)
    },
    [selectWorkspaceState],
  )

  const selectSession = useCallback(
    (session: WorkbenchSession) => {
      selectSessionState(session.id)
      if (session.project_id) void claude.setProjectLastOpened(session.project_id)
    },
    [selectSessionState],
  )

  const { closeSession, deleteSession, forkSession, renameSession, togglePinSession } =
    useSessionActions({
      closeSession: closeSessionState,
      controllerRegistry,
      onError: onSessionError,
      refreshProjects,
      releaseSessionController,
      removeSession,
      selectSession: selectSessionState,
      setSessionTitle,
      togglePinSession: togglePinSessionState,
    })

  const removeProject = useCallback(
    async (projectId: string) => {
      try {
        // Dispose the project's live controllers first: their queries and
        // usage writes must stop before the session files are deleted.
        const sessionIds = Object.values(useWorkbenchStore.getState().sessions)
          .filter((session) => session.project_id === projectId)
          .map((session) => session.id)
        await Promise.all(sessionIds.map(releaseSessionController))
        await claude.removeProject(projectId)
        await claude.deleteLocalProjectSessions(projectId)
        if (useWorkbenchStore.getState().currentProjectId === projectId) {
          selectWorkspaceState(null)
        }
        await refreshProjects()
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : 'Failed to remove project'
        throw caught instanceof Error ? caught : new Error(message)
      }
    },
    [refreshProjects, releaseSessionController, selectWorkspaceState],
  )

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const nextIndex =
          event.key === 'ArrowDown'
            ? Math.min(focusedIndex + 1, Math.max(0, sessionList.length - 1))
            : Math.max(focusedIndex - 1, 0)
        if (nextIndex !== focusedIndex) {
          setFocusSessionId(sessionList[nextIndex]?.session.id ?? null)
          setFocusNavigationRevision((revision) => revision + 1)
        }
      }
    },
    [focusedIndex, sessionList],
  )

  useEffect(() => {
    setFocusSessionId(currentSessionId)
  }, [currentSessionId])

  return {
    activeTab,
    setActiveTab,
    activeTimeline,
    bindClaudeSession,
    closeSession,
    deleteSession,
    forkSession,
    focusNavigationRevision,
    focusedIndex,
    focusedSessionId,
    handleListKeyDown,
    hasLoadedCatalog,
    isInitialLoading: isLoading && !hasLoadedCatalog,
    isLoading,
    isMockProject: import.meta.env.DEV && selectedProject?.id === DEV_MOCK_PROJECT_ID,
    pinnedSessionIds: pinnedSessionIdSet,
    tabSessionIds,
    tabSessions,
    projectMode,
    projectListError,
    projectSessionErrors,
    loadingProjectSessionIds,
    projects,
    removeProject,
    refreshProjects,
    renameSession,
    sessionList,
    sessionTimeline,
    selectedProject,
    selectedSession,
    sessionActivity,
    saveProjectDefaultModel,
    selectProject,
    selectSession,
    setSessionActivity,
    togglePinSession,
    workspaceSessions,
  }
}
