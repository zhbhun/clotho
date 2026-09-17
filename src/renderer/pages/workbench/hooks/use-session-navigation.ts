import { useCallback, useEffect } from 'react'

import { toast } from '@/shadcn/toast'

import { materializeUnsavedDraft } from '../services/session-records'
import { draftTitleFromPrompt } from '../session/draft-title'
import { useSessionControllerRegistry } from '../session/session-controller-context'
import type { SessionComposerDraft } from '../session/session-types'
import {
  type WorkbenchSession,
  useWorkbenchStore,
  workspaceKeyForProjectId,
} from '../stores/workbench-store'
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
    const title = composer ? draftTitleFromPrompt(composer.prompt, composer.attachments ?? []) : ''
    if (title) state.setSessionTitle(session.id, title)
  }, [registry])

  const handleStartNewSessionInCurrentWorkspace = useCallback(
    (draft?: SessionComposerDraft) => {
      // Wired onClick handlers receive a MouseEvent; only a real composer
      // draft carries a prompt or attachments.
      const initialDraft =
        typeof draft?.prompt === 'string' || Array.isArray(draft?.attachments) ? draft : undefined
      saveTitle()
      const state = useWorkbenchStore.getState()
      const projectId = state.projectMode === 'project' ? state.currentProjectId : null

      if (!initialDraft) {
        // A blank new chat is the session a second "new chat" asks for: keep
        // the existing one instead of stacking identical empty tabs.
        const workspaceKey = workspaceKeyForProjectId(projectId, state.projects)
        const blankDraftId = state.tabsByWorkspace[workspaceKey]?.find(
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
      workbench.selectSession(session)
    },
    [saveTitle, workbench],
  )
  const handleSwitchWorkspace = useCallback(
    (projectId: string | null) => {
      saveTitle()
      workbench.selectProject(projectId)

      const state = useWorkbenchStore.getState()
      if (state.currentSessionId || (projectId && workbench.projectSessionErrors[projectId])) return

      const sessionId = state.createDraftSession(projectId)
      const session = useWorkbenchStore.getState().sessions[sessionId]
      if (!session) return
      // A blank session on workspace switch is ephemeral: it is only
      // persisted once it gains content (saveTitle on leaving, tab close,
      // or first send).
      workbench.selectSession(session)
    },
    [saveTitle, workbench],
  )
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

  useEffect(
    () => registry.retain(new Set(workbench.tabSessionIds)),
    [registry, workbench.tabSessionIds],
  )
  return {
    handleNavigate,
    handleSelectSession,
    handleStartNewSessionInCurrentWorkspace,
    handleSwitchWorkspace,
  }
}
