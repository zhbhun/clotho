import { describe, expect, it } from 'vitest'

import { UI_STORAGE_KEY, readUiState, updateUiState } from './ui-storage'

function createStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('UI local storage', () => {
  it('merges shared UI patches without knowing page-private fields', () => {
    const storage = createStorage()
    storage.setItem(UI_STORAGE_KEY, JSON.stringify({ currentWorkspaceKey: 'project:workspace-1' }))

    updateUiState({ sidebarWidth: 360 }, storage)

    expect(readUiState(storage)).toEqual({
      currentWorkspaceKey: 'project:workspace-1',
      sidebarWidth: 360,
    })
  })

  it('ignores malformed top-level values', () => {
    const storage = createStorage()
    storage.setItem(UI_STORAGE_KEY, '[]')

    expect(readUiState(storage)).toEqual({})
  })
})
