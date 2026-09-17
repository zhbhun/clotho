import { describe, expect, it } from 'vitest'

import { UI_STORAGE_KEY, readUiState, updateUiState } from '../../../services/ui-storage'
import { createWorkbenchUiStorage } from './workbench-ui-storage'

function createStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('workbench UI local storage', () => {
  it('keeps workbench fields with shared UI state in one top-level record', async () => {
    const storage = createStorage()
    updateUiState({ sidebarWidth: 360 }, storage)
    const workbenchStorage = createWorkbenchUiStorage(storage)

    workbenchStorage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        state: {
          currentWorkspaceKey: 'project:workspace-1',
          tabsByWorkspace: { 'project:workspace-1': ['session-1'] },
          activeSessionByWorkspace: { 'project:workspace-1': 'session-1' },
          pinnedSessionIds: ['session-1'],
          unreadSessionActivity: { 'session-1': 'unread-success' },
        },
        version: 1,
      }),
    )

    expect(readUiState(storage)).toEqual({
      sidebarWidth: 360,
      currentWorkspaceKey: 'project:workspace-1',
      tabsByWorkspace: { 'project:workspace-1': ['session-1'] },
      activeSessionByWorkspace: { 'project:workspace-1': 'session-1' },
      pinnedSessionIds: ['session-1'],
      unreadSessionActivity: { 'session-1': 'unread-success' },
    })
    expect(JSON.parse((await workbenchStorage.getItem(UI_STORAGE_KEY)) ?? '{}')).toMatchObject({
      version: 1,
      state: { pinnedSessionIds: ['session-1'] },
    })
  })

  it('clears only workbench fields while preserving shared UI state', () => {
    const storage = createStorage()
    storage.setItem(
      UI_STORAGE_KEY,
      JSON.stringify({
        sidebarWidth: 360,
        currentWorkspaceKey: 'project:workspace-1',
        pinnedSessionIds: ['session-1'],
      }),
    )

    createWorkbenchUiStorage(storage).removeItem(UI_STORAGE_KEY)

    expect(readUiState(storage)).toEqual({ sidebarWidth: 360 })
  })
})
