// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type WorkbenchSession, useWorkbenchStore } from '../stores/workbench-store'
import { startWorkbenchPersistence } from './workbench-persistence'

const PROJECT = {
  id: 'project-1',
  workspace_id: 'project-workspace',
  path: '/Users/me/project',
  sessions: [],
  created_at: 0,
}

function session(id: string, overrides: Partial<WorkbenchSession> = {}): WorkbenchSession {
  return {
    id,
    claudeSessionId: id,
    project_id: PROJECT.id,
    project_path: PROJECT.path,
    created_at: 1,
    title: id,
    ...overrides,
  }
}

function loadCatalog(sessions: WorkbenchSession[]) {
  useWorkbenchStore.getState().replaceCatalog({
    projects: [PROJECT],
    sessions: { [PROJECT.id]: sessions },
    branches: {},
  })
}

describe('workbench persistence', () => {
  beforeEach(() => {
    useWorkbenchStore.getState().reset()
  })

  afterEach(() => {
    vi.useRealTimers()
    useWorkbenchStore.getState().reset()
  })

  it('applies the persisted window ui once the desktop storage answers', async () => {
    const persistence = startWorkbenchPersistence({
      readWindowUi: async () => ({
        currentWorkspaceKey: 'project:project-workspace',
        sessionTabsByWorkspace: { 'project:project-workspace': ['session-1'] },
        activeSessionByWorkspace: { 'project:project-workspace': 'session-1' },
      }),
      writeWindowUi: vi.fn(),
    })

    await persistence.ready

    expect(useWorkbenchStore.getState().currentWorkspaceKey).toBe('project:project-workspace')
    expect(useWorkbenchStore.getState().sessionTabsByWorkspace).toEqual({
      'project:project-workspace': ['session-1'],
    })
    persistence.stop()
  })

  it('writes the window ui debounced after store changes', async () => {
    vi.useFakeTimers()
    const writeWindowUi = vi.fn<(ui: Record<string, unknown>) => Promise<void>>(
      async () => undefined,
    )
    const persistence = startWorkbenchPersistence({
      readWindowUi: async () => undefined,
      writeWindowUi,
      debounceMs: 50,
    })
    await persistence.ready
    loadCatalog([session('session-1')])

    useWorkbenchStore.getState().selectSession('session-1')
    expect(writeWindowUi).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)

    expect(writeWindowUi).toHaveBeenCalledTimes(1)
    expect(writeWindowUi.mock.calls[0][0]).toMatchObject({
      currentWorkspaceKey: 'project:project-workspace',
      sessionTabsByWorkspace: { 'project:project-workspace': ['session-1'] },
      activeSessionByWorkspace: { 'project:project-workspace': 'session-1' },
    })
    persistence.stop()
  })

  it('syncs unread transitions to the session index', async () => {
    const setSessionsUnread = vi.fn(async () => undefined)
    const persistence = startWorkbenchPersistence({
      readWindowUi: async () => undefined,
      writeWindowUi: vi.fn(),
      setSessionsUnread,
    })
    await persistence.ready
    loadCatalog([session('session-1')])

    useWorkbenchStore.getState().setSessionActivity('session-1', 'error')
    expect(setSessionsUnread).toHaveBeenLastCalledWith(
      [
        {
          projectId: PROJECT.id,
          sessionId: 'session-1',
          claudeSessionId: 'session-1',
        },
      ],
      'error',
    )

    useWorkbenchStore.getState().selectSession('session-1')
    expect(setSessionsUnread).toHaveBeenLastCalledWith(
      [
        {
          projectId: PROJECT.id,
          sessionId: 'session-1',
          claudeSessionId: 'session-1',
        },
      ],
      null,
    )
    persistence.stop()
  })
})
