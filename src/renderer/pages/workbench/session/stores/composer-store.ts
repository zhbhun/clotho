import { createStore } from 'zustand/vanilla'

import type { ClaudeAttachment } from '@/shared/rpc'

import type { ClaudePermissionMode } from '../../../../services/claude/claude'
import type { SessionPreferences } from './session-preferences'

/** A message queued behind the running turn; sent automatically when it succeeds. */
export type PendingMessage = {
  prompt: string
  attachments: ClaudeAttachment[]
}

export type ComposerState = SessionPreferences & {
  setPrompt: (prompt: string, ...args: unknown[]) => void
  attachments: ClaudeAttachment[]
  pendingMessage: PendingMessage | null
  setSelectedProviderModel: (providerId: string, modelId: string) => void
  setSelectedAgent: (agent: string | null) => void
  setPermissionMode: (mode: ClaudePermissionMode) => void
  reset: (preferences: SessionPreferences) => void
}

export function createComposerStore(preferences: SessionPreferences) {
  return createStore<ComposerState>((set) => ({
    ...preferences,
    attachments: preferences.attachments ?? [],
    pendingMessage: null,
    setPrompt: (prompt, ...args) => {
      void args
      set({ prompt })
    },
    setSelectedProviderModel: (selectedProviderId, selectedModelId) =>
      set({ selectedProviderId, selectedModelId }),
    setSelectedAgent: (selectedAgent) => set({ selectedAgent }),
    setPermissionMode: (permissionMode) => set({ permissionMode }),
    reset: (next) => set({ ...next, attachments: next.attachments ?? [] }),
  }))
}
