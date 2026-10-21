// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProjectUiState, WindowDescription, WorkbenchWindowUiState } from '@/shared/rpc'

import { type WorkbenchSession, useWorkbenchStore } from '../stores/workbench-store'
import { startWorkbenchPersistence } from './workbench-persistence'

const PROJECT = {
  id: 'project-1',
  workspace_id: 'project-workspace',
  path: '/Users/me/project',
  sessions: [],
  created_at: 0,
}

const FREE_WINDOW: WindowDescription = {
  id: 'free-1',
  kind: 'free',
  projectId: null,
  pinnedProjectIds: [],
}
const PROJECT_WINDOW: WindowDescription = {
  id: 'project-window-1',
  kind: 'project',
  projectId: PROJECT.id,
  pinnedProjectIds: [PROJECT.id],
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
    const ui: WorkbenchWindowUiState = {
      currentWorkspaceKey: 'project:project-workspace',
      sessionTabsByWorkspace: { 'project:project-workspace': ['session-1'] },
      activeSessionByWorkspace: { 'project:project-workspace': 'session-1' },
    }
    const persistence = startWorkbenchPersistence({
      describeWindow: async () => FREE_WINDOW,
      readWindowUi: async () => ui,
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
    const writeWindowUi = vi.fn<(ui: WorkbenchWindowUiState) => Promise<void>>(
      async () => undefined,
    )
    const persistence = startWorkbenchPersistence({
      describeWindow: async () => FREE_WINDOW,
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

  it('restores a project window from its project state and writes it back there', async () => {
    vi.useFakeTimers()
    const writeWindowUi = vi.fn<(ui: WorkbenchWindowUiState) => Promise<void>>(
      async () => undefined,
    )
    const writeProjectUi = vi.fn<(ui: ProjectUiState) => Promise<void>>(async () => undefined)
    const persistence = startWorkbenchPersistence({
      describeWindow: async () => PROJECT_WINDOW,
      readWindowUi: async () => undefined,
      writeWindowUi,
      readProjectUi: async () => ({
        sessionIds: [session('session-1').id],
        activeSessionId: 'session-1',
      }),
      writeProjectUi,
      debounceMs: 50,
    })
    await persistence.ready

    // Seeded before the catalog: keyed by the project id, with the current
    // project set so replaceCatalog can derive the real workspace key.
    expect(useWorkbenchStore.getState()).toMatchObject({
      currentProjectId: PROJECT.id,
      currentWorkspaceKey: 'project:project-1',
      sessionTabsByWorkspace: { 'project:project-1': ['session-1'] },
    })

    // The restore's own change must not write an uncatalogued (empty-looking)
    // workspace back.
    await vi.advanceTimersByTimeAsync(50)
    expect(writeProjectUi).not.toHaveBeenCalled()

    loadCatalog([session('session-1')])
    expect(useWorkbenchStore.getState().currentWorkspaceKey).toBe('project:project-workspace')

    useWorkbenchStore.getState().selectSession('session-1')
    await vi.advanceTimersByTimeAsync(50)

    expect(writeProjectUi).toHaveBeenCalledTimes(1)
    expect(writeProjectUi.mock.calls[0][0]).toEqual({
      sessionIds: ['session-1'],
      activeSessionId: 'session-1',
    })
    expect(writeWindowUi).not.toHaveBeenCalled()
    persistence.stop()
  })

  it('defers a write that races its window identity and writes once it lands', async () => {
    vi.useFakeTimers()
    let resolveIdentity: (identity: WindowDescription) => void = () => {}
    const writeWindowUi = vi.fn<(ui: WorkbenchWindowUiState) => Promise<void>>(
      async () => undefined,
    )
    const persistence = startWorkbenchPersistence({
      describeWindow: () =>
        new Promise<WindowDescription>((resolve) => {
          resolveIdentity = resolve
        }),
      readWindowUi: async () => undefined,
      writeWindowUi,
      debounceMs: 50,
    })
    loadCatalog([session('session-1')])
    useWorkbenchStore.getState().selectSession('session-1')
    await vi.advanceTimersByTimeAsync(50)
    expect(writeWindowUi).not.toHaveBeenCalled()

    resolveIdentity(FREE_WINDOW)
    await persistence.ready
    await vi.advanceTimersByTimeAsync(50)

    expect(writeWindowUi).toHaveBeenCalledTimes(1)
    persistence.stop()
  })

  it('syncs unread transitions to the session index', async () => {
    const setSessionsUnread = vi.fn(async () => undefined)
    const persistence = startWorkbenchPersistence({
      describeWindow: async () => FREE_WINDOW,
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
