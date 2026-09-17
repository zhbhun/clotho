import { createStore } from 'zustand/vanilla'

import type { ClaudeAttachment } from '@/shared/rpc'

import type { ClaudePermissionMode } from '../../../../services/claude/claude'
import type { SessionPreferences } from './session-preferences'

export type ComposerState = SessionPreferences & {
  setPrompt: (prompt: string, ...args: unknown[]) => void
  attachments: ClaudeAttachment[]
  setSelectedProviderModel: (providerId: string, modelId: string) => void
  setSelectedAgent: (agent: string | null) => void
  setPermissionMode: (mode: ClaudePermissionMode) => void
  reset: (preferences: SessionPreferences) => void
}

export function createComposerStore(preferences: SessionPreferences) {
  return createStore<ComposerState>((set) => ({
    ...preferences,
    attachments: preferences.attachments ?? [],
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
