import { createStore } from 'zustand/vanilla'

import type { ClaudeAgentInfo, ClaudeSlashCommand } from '../../../../services/claude/claude'

export type CatalogState = {
  availableCommands: ClaudeSlashCommand[]
  availableAgents: ClaudeAgentInfo[]
}

export function createCatalogStore() {
  return createStore<CatalogState>(() => ({
    availableCommands: [],
    availableAgents: [],
  }))
}
