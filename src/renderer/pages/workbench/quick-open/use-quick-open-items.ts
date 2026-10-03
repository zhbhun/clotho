import { useMemo } from 'react'
import { useStore } from 'zustand'

import { MOCK_PROJECT_ID } from '../../../services/claude/mock/project'
import { previewText } from '../session/conversation/conversation-toc'
import { type ClaudeMessage, isUserPromptMessage } from '../session/services/message'
import { useSessionControllerRegistry } from '../session/session-controller-context'
import { createConversationStore } from '../session/stores/conversation-store'
import { type WorkbenchSession, useWorkbenchStore } from '../stores/workbench-store'
import { compareSessions } from '../utils/session-list'

export const RECENT_SESSIONS_LIMIT = 30
export const MESSAGE_PREVIEW_LIMIT = 200

const DEV_MOCK_PROJECT_ID = import.meta.env.DEV ? MOCK_PROJECT_ID : undefined
const HIDDEN_SESSION_PROJECT_IDS = new Set(DEV_MOCK_PROJECT_ID ? [DEV_MOCK_PROJECT_ID] : [])

function visibleQuickOpenSession(session: WorkbenchSession) {
  if (session.isUnsavedDraft) return false
  if (session.project_id && HIDDEN_SESSION_PROJECT_IDS.has(session.project_id)) return false
  return true
}

/** Sessions visible to the quick-open panel: all of them newest first, the
    current project's slice (home mode lists everything, like the history
    picker), and the most recently updated sessions across projects. */
export function useQuickOpenSessions() {
  const sessionMap = useWorkbenchStore((state) => state.sessions)
  const currentProjectId = useWorkbenchStore((state) => state.currentProjectId)

  return useMemo(() => {
    const allSessions = Object.values(sessionMap)
      .filter(visibleQuickOpenSession)
      .toSorted(compareSessions)
    return {
      allSessions,
      projectSessions: currentProjectId
        ? allSessions.filter((session) => session.project_id === currentProjectId)
        : allSessions,
      recentSessions: allSessions.slice(0, RECENT_SESSIONS_LIMIT),
    }
  }, [currentProjectId, sessionMap])
}

export type QuickOpenSentPrompt = {
  id: string
  position: number
  /** Full cleaned prompt text; filter against it and elide for display. */
  preview: string
}

/** An inert stand-in for the missing conversation store so callers can
    subscribe unconditionally when no session is selected. */
const fallbackConversationStore = createConversationStore()

function buildSentPrompts(
  messageIds: string[],
  messages: Record<string, ClaudeMessage>,
): QuickOpenSentPrompt[] {
  const prompts: QuickOpenSentPrompt[] = []
  for (const id of messageIds) {
    const message = messages[id]
    if (!message || message.parentToolUseId || !isUserPromptMessage(message)) continue
    prompts.push({ id, position: prompts.length + 1, preview: previewText(message.content) })
  }
  return prompts
}

const NO_SENT_PROMPTS: QuickOpenSentPrompt[] = []

/** User prompts of the selected session in send order. Disabled while the
    panel is closed so streaming updates stop at a constant empty list.
    Subscribes to the stable `messageIds`/`messages` collection references and
    derives the array in a memo — returning a fresh array from the selector
    itself would loop useSyncExternalStore. */
export function useQuickOpenSentPrompts(enabled: boolean): QuickOpenSentPrompt[] {
  const sessionId = useWorkbenchStore((state) => state.currentSessionId)
  const registry = useSessionControllerRegistry()
  const conversationStore = sessionId ? registry.find(sessionId)?.conversationStore : undefined
  const messageIds = useStore(
    conversationStore ?? fallbackConversationStore,
    (state) => state.messageIds,
  )
  const messages = useStore(
    conversationStore ?? fallbackConversationStore,
    (state) => state.messages,
  )

  return useMemo(
    () => (enabled ? buildSentPrompts(messageIds, messages) : NO_SENT_PROMPTS),
    [enabled, messageIds, messages],
  )
}
