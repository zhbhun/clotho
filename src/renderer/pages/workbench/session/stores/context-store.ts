import { createStore } from 'zustand/vanilla'

import type { SessionContext } from '../session-types'

export type SessionContextState = SessionContext & {
  sessionId: string
  syncContext: (context: SessionContext) => void
}

const CONTEXT_KEYS: (keyof SessionContext)[] = [
  'claudeSessionId',
  'projectId',
  'projectPath',
  'additionalDirectories',
  'sessionTitle',
  'defaultProviderId',
  'defaultModelId',
  'isHomeMode',
  'isMockProject',
]

export function createSessionContextStore(sessionId: string, context: SessionContext) {
  return createStore<SessionContextState>((set) => ({
    sessionId,
    ...context,
    syncContext: (next) =>
      set((current) => {
        if (CONTEXT_KEYS.every((key) => Object.is(current[key], next[key]))) return current
        return next
      }),
  }))
}
