import type { StateStorage } from 'zustand/middleware'

import {
  type UiStorage,
  readUiState,
  replaceUiState,
  updateUiState,
} from '../../../services/ui-storage'

export type UiUnreadActivity = 'unread-success' | 'unread-error'

export type WorkbenchUiState = {
  currentWorkspaceKey?: string
  tabsByWorkspace?: Record<string, string[]>
  activeSessionByWorkspace?: Record<string, string | null>
  pinnedSessionIds?: string[]
  unreadSessionActivity?: Record<string, UiUnreadActivity>
}

const WORKBENCH_FIELDS = [
  'currentWorkspaceKey',
  'tabsByWorkspace',
  'activeSessionByWorkspace',
  'pinnedSessionIds',
  'unreadSessionActivity',
] as const

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? [...new Set(value)]
    : undefined
}

function stringArrayRecord(value: unknown): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const entries = Object.entries(value).flatMap(([key, item]) => {
    const values = stringArray(item)
    return values ? [[key, values] as const] : []
  })
  return Object.fromEntries(entries)
}

function nullableStringRecord(value: unknown): Record<string, string | null> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      item === null || typeof item === 'string' ? [[key, item] as const] : [],
    ),
  )
}

function unreadActivityRecord(value: unknown): Record<string, UiUnreadActivity> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, item]) =>
      item === 'unread-success' || item === 'unread-error' ? [[key, item] as const] : [],
    ),
  )
}

function workbenchUiState(value: Record<string, unknown>): WorkbenchUiState {
  const tabsByWorkspace = stringArrayRecord(value.tabsByWorkspace)
  const activeSessionByWorkspace = nullableStringRecord(value.activeSessionByWorkspace)
  const pinnedSessionIds = stringArray(value.pinnedSessionIds)
  const unreadSessionActivity = unreadActivityRecord(value.unreadSessionActivity)
  return {
    ...(typeof value.currentWorkspaceKey === 'string'
      ? { currentWorkspaceKey: value.currentWorkspaceKey }
      : {}),
    ...(tabsByWorkspace ? { tabsByWorkspace } : {}),
    ...(activeSessionByWorkspace ? { activeSessionByWorkspace } : {}),
    ...(pinnedSessionIds ? { pinnedSessionIds } : {}),
    ...(unreadSessionActivity ? { unreadSessionActivity } : {}),
  }
}

export function createWorkbenchUiStorage(storage?: UiStorage): StateStorage {
  return {
    getItem: () => {
      const state = workbenchUiState(readUiState(storage))
      return Object.keys(state).length ? JSON.stringify({ state, version: 1 }) : null
    },
    setItem: (_name, value) => {
      try {
        const parsed = JSON.parse(value) as { state?: unknown }
        const state =
          parsed.state && typeof parsed.state === 'object' && !Array.isArray(parsed.state)
            ? workbenchUiState(parsed.state as Record<string, unknown>)
            : {}
        updateUiState(state, storage)
      } catch {
        // Ignore malformed Zustand persistence payloads.
      }
    },
    removeItem: () => {
      const state = { ...readUiState(storage) }
      for (const field of WORKBENCH_FIELDS) delete state[field]
      replaceUiState(state, storage)
    },
  }
}
