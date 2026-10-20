import { useCallback, useEffect } from 'react'

import { toast } from '@/shadcn/toast'

import { claude } from '../../../services/claude/claude'
import { listenDesktopEvent } from '../../../services/desktop/client'
import { materializeUnsavedDraft } from '../services/session-records'
import { draftTitleFromPrompt } from '../session/draft-title'
import { useSessionControllerRegistry } from '../session/session-controller-context'
import type { SessionComposerDraft } from '../session/session-types'
import {
  type WorkbenchSession,
  useWorkbenchStore,
  workspaceKeyForProjectId,
  workspaceUiState,
} from '../stores/workbench-store'
import { findHomeProjectId } from '../utils/home-project'
import { DEFAULT_SESSION_TITLE } from '../utils/session-list'
import type { useWorkbench } from './use-workbench'

export function useSessionNavigation(workbench: ReturnType<typeof useWorkbench>) {
  const registry = useSessionControllerRegistry()
  const saveTitle = useCallback(() => {
    const state = useWorkbenchStore.getState()
    const session = state.currentSessionId ? state.sessions[state.currentSessionId] : undefined
    if (!session?.isDraft) return
    const composer = registry.find(session.id)?.composerService.snapshot()
    if (session.isUnsavedDraft) {
      // An ephemeral blank session only becomes a stored draft once the
      // user typed something and is now leaving it.
      if (!composer || (!composer.prompt.trim() && !composer.attachments?.length)) return
      void materializeUnsavedDraft(session.id, composer).catch(() => {})
      return
    }
    if (session.title !== DEFAULT_SESSION_TITLE || session.custom_title) return
    const title = composer ? draftTitleFromPrompt(composer.prompt) : ''
    if (title) state.setLocalTitle(session.id, title)
  }, [registry])

  const handleStartNewSessionInCurrentWorkspace = useCallback(
    (draft?: SessionComposerDraft) => {
      // Wired onClick handlers receive a MouseEvent; only a real composer
      // draft carries a prompt or attachments.
      const initialDraft =
        typeof draft?.prompt === 'string' || Array.isArray(draft?.attachments) ? draft : undefined
      saveTitle()
      const state = useWorkbenchStore.getState()
      // Unselected resolves to the built-in work project that owns home conversations.
      const projectId =
        state.projectMode === 'project' ? state.currentProjectId : findHomeProjectId(state.projects)

      if (!initialDraft) {
        // A blank new chat is the session a second "new chat" asks for: keep
        // the existing one instead of stacking identical empty tabs.
        const workspaceKey = workspaceKeyForProjectId(projectId, state.projects)
        const blankDraftId = state.sessionTabsByWorkspace[workspaceKey]?.find(
          (id) => state.sessions[id]?.isUnsavedDraft,
        )
        if (blankDraftId) {
          const blankDraft = state.sessions[blankDraftId]
          if (blankDraft && blankDraftId !== state.currentSessionId) {
            workbench.selectSession(blankDraft)
          }
          queueMicrotask(() => document.querySelector<HTMLElement>('[data-prompt-editor]')?.focus())
          return
        }
      }

      const sessionId = state.createDraftSession(projectId)
      const session = useWorkbenchStore.getState().sessions[sessionId]
      void (async () => {
        if (initialDraft) {
          // Starts with content: persist the draft right away. A blank new
          // chat stays in memory until it gains content.
          const controller = registry.get({
            sessionId,
            claudeSessionId: null,
            projectId,
            projectPath: session.project_path || null,
            isHomeMode: !projectId,
            isMockProject: workbench.isMockProject,
            onBindClaudeSession: workbench.bindClaudeSession,
            onActivityChange: workbench.setSessionActivity,
          })
          await controller.initialize()
          controller.composerService.restorePrompt(initialDraft.prompt, initialDraft.attachments)
          await materializeUnsavedDraft(sessionId, controller.composerService.snapshot())
        }
        workbench.selectSession(session)
        queueMicrotask(() => document.querySelector<HTMLElement>('[data-prompt-editor]')?.focus())
      })().catch((error) =>
        toast.add({ title: 'Could not create chat', description: String(error), type: 'error' }),
      )
    },
    [registry, saveTitle, workbench],
  )

  const handleSelectSession = useCallback(
    (session: WorkbenchSession) => {
      saveTitle()
      const state = useWorkbenchStore.getState()
      const projectId = session.project_id || null
      if (state.windowKind === 'main' && projectId && state.focusedProjectIds.includes(projectId)) {
        // The project lives in its own window; show the session there instead.
        void claude
          .focusProjectWindow(projectId, {
            sessionId: session.id,
            claudeSessionId: session.claudeSessionId,
          })
          .then(({ focused }) => {
            if (!focused) workbench.selectSession(session)
          })
          .catch(() => workbench.selectSession(session))
        return
      }
      workbench.selectSession(session)
    },
    [saveTitle, workbench],
  )

  /** Shows a project in this window; the blank draft keeps an empty workspace usable. */
  const switchWorkspaceLocally = useCallback(
    (projectId: string | null) => {
      // Exiting to unselected lands on the built-in work default project.
      const state = useWorkbenchStore.getState()
      const targetProjectId = projectId ?? findHomeProjectId(state.projects)
      workbench.selectProject(targetProjectId)

      const nextState = useWorkbenchStore.getState()
      if (
        nextState.currentSessionId ||
        (targetProjectId && workbench.projectSessionErrors[targetProjectId])
      ) {
        return
      }

      const sessionId = nextState.createDraftSession(targetProjectId)
      const session = useWorkbenchStore.getState().sessions[sessionId]
      if (!session) return
      // A blank session on workspace switch is ephemeral: it is only
      // persisted once it gains content (saveTitle on leaving, tab close,
      // or first send).
      workbench.selectSession(session)
    },
    [workbench],
  )

  /** A focused window switching projects rebinds itself; its old project goes back to the main window. */
  const refocusWindow = useCallback(
    async (projectId: string) => {
      const state = useWorkbenchStore.getState()
      const currentProjectId = state.focusedProjectId
      if (!currentProjectId) return
      const result = await claude.refocusWindow({
        projectId,
        ui: workspaceUiState(state, currentProjectId),
      })
      if (result.outcome !== 'refocused') return
      const store = useWorkbenchStore.getState()
      store.detachWorkspace(currentProjectId)
      store.setWindowIdentity({ kind: 'focused', projectId })
      if (result.ui) store.attachWorkspace(projectId, result.ui)
      // Select before the reload so the catalog lands on the new project
      // instead of seeding a home draft into a window that has no home.
      workbench.selectProject(projectId)
      await workbench.refreshProjects().catch(() => {})
      switchWorkspaceLocally(projectId)
    },
    [switchWorkspaceLocally, workbench],
  )

  const handleSwitchWorkspace = useCallback(
    (projectId: string | null) => {
      saveTitle()
      const state = useWorkbenchStore.getState()
      if (state.windowKind === 'focused') {
        // A focused window has no home; picking another project refocuses it.
        if (!projectId || projectId === state.focusedProjectId) return
        void refocusWindow(projectId).catch((error) =>
          toast.add({
            title: 'Could not switch project',
            description: String(error),
            type: 'error',
          }),
        )
        return
      }
      if (projectId && state.focusedProjectIds.includes(projectId)) {
        // The project lives in its own window; bring that one up instead.
        void claude
          .focusProjectWindow(projectId)
          .then(({ focused }) => {
            if (!focused) switchWorkspaceLocally(projectId)
          })
          .catch(() => switchWorkspaceLocally(projectId))
        return
      }
      switchWorkspaceLocally(projectId)
    },
    [refocusWindow, saveTitle, switchWorkspaceLocally],
  )

  const handleOpenProjectInNewWindow = useCallback(() => {
    saveTitle()
    const state = useWorkbenchStore.getState()
    const projectId = state.currentProjectId
    if (state.windowKind !== 'main' || !projectId || state.projects[projectId]?.is_home) return
    void claude
      .openFocusedWindow({ projectId, ui: workspaceUiState(state, projectId) })
      .then(({ opened }) => {
        // Not opened means the project already had a window, now in front.
        if (!opened) return
        useWorkbenchStore.getState().detachWorkspace(projectId)
        switchWorkspaceLocally(null)
      })
      .catch((error) =>
        toast.add({ title: 'Could not open window', description: String(error), type: 'error' }),
      )
  }, [saveTitle, switchWorkspaceLocally])

  const handleNavigate = useCallback(
    (location: { projectId: string | null; sessionId: string | null }) => {
      const session = location.sessionId
        ? useWorkbenchStore.getState().sessions[location.sessionId]
        : undefined
      if (session) handleSelectSession(session)
      else handleSwitchWorkspace(location.projectId)
    },
    [handleSelectSession, handleSwitchWorkspace],
  )

  // Workspace hand-over between windows, driven by the main process.
  useEffect(() => {
    let isActive = true
    const unsubscribers: Array<() => void> = []
    const track = (subscription: Promise<() => void>) => {
      void subscription.then((unsubscribe) => {
        if (isActive) unsubscribers.push(unsubscribe)
        else unsubscribe()
      })
    }
    track(
      listenDesktopEvent('window-detach-project', ({ requestId, projectId }) => {
        saveTitle()
        const store = useWorkbenchStore.getState()
        const wasCurrent = store.currentProjectId === projectId
        const ui = store.detachWorkspace(projectId)
        void claude.reportDetachedProject({ requestId, projectId, ui }).catch(() => {})
        if (wasCurrent && store.windowKind === 'main') switchWorkspaceLocally(null)
      }),
    )
    track(
      listenDesktopEvent('window-attach-project', ({ projectId, ui }) => {
        // The catalog must know the handed-over sessions before their tabs
        // land, or the next reconcile would drop the unknown ids.
        void workbench
          .refreshProjects()
          .catch(() => {})
          .then(() => useWorkbenchStore.getState().attachWorkspace(projectId, ui))
      }),
    )
    track(
      listenDesktopEvent('window-select-session', ({ sessionId, claudeSessionId }) => {
        // Another window picked a session of this window's project. A session
        // it created is only known here by its Claude id.
        const find = () => {
          const sessions = useWorkbenchStore.getState().sessions
          return (
            sessions[sessionId] ??
            (claudeSessionId
              ? Object.values(sessions).find((item) => item.claudeSessionId === claudeSessionId)
              : undefined)
          )
        }
        const session = find()
        if (session) {
          handleSelectSession(session)
          return
        }
        void workbench
          .refreshProjects()
          .catch(() => {})
          .then(() => {
            const late = find()
            if (late) handleSelectSession(late)
          })
      }),
    )
    return () => {
      isActive = false
      for (const unsubscribe of unsubscribers) unsubscribe()
    }
  }, [handleSelectSession, saveTitle, switchWorkspaceLocally, workbench])

  useEffect(
    () => registry.retain(new Set(workbench.tabSessionIds)),
    [registry, workbench.tabSessionIds],
  )
  return {
    handleNavigate,
    handleOpenProjectInNewWindow,
    handleSelectSession,
    handleStartNewSessionInCurrentWorkspace,
    handleSwitchWorkspace,
  }
}
