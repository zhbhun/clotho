import { createStore } from 'zustand/vanilla'

import type { ClaudeToolRequest } from '../../../../services/claude/claude'
import type { MessageEditDraft, SessionRuntimeStatus } from '../session-types'

export type SessionErrorKind =
  | 'branch-create'
  | 'draft-close'
  | 'message-edit'
  | 'message-send'
  | 'model-required'
  | 'session-cleanup'
  | 'session-initialize'
  | 'session-reload'

export type SessionError = {
  kind: SessionErrorKind
  message: string
}

export type RuntimeState = {
  runtimeStatus: SessionRuntimeStatus
  runtimeCwd: string | null
  runtimeResume: string | null
  runtimeError: SessionError | null
  isHistoryLoading: boolean
  isSubmitting: boolean
  isStreaming: boolean
  isMessageEditPending: boolean
  messageEditDraft: MessageEditDraft | null
  streamingElapsed: number
  pendingToolRequests: Record<string, ClaudeToolRequest>
}

export function createRuntimeStore(claudeSessionId: string | null) {
  return createStore<RuntimeState>(() => ({
    runtimeStatus: 'idle',
    runtimeCwd: null,
    runtimeResume: claudeSessionId,
    runtimeError: null,
    isHistoryLoading: false,
    isSubmitting: false,
    isStreaming: false,
    isMessageEditPending: false,
    messageEditDraft: null,
    streamingElapsed: 0,
    pendingToolRequests: {},
  }))
}
