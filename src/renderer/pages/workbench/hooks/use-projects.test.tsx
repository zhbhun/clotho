import { act, renderHook, waitFor } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { requestFromDesktop } from '../../../services/desktop/client'
import { sessionPersistence } from '../services/session-persistence'
import { useWorkbenchStore } from '../stores/workbench-store'
import { useProjects } from './use-projects'

vi.mock('../../../services/desktop/client', () => ({
  isDesktopRuntime: () => true,
  requestFromDesktop: vi.fn(),
  listenDesktopEvent: vi.fn(() => Promise.resolve(() => {})),
}))

const PROJECT = {
  id: 'project-1',
  path: '/workspace/project-1',
  sessions: ['session-1'],
  created_at: 0,
}

const REMOTE_SESSION = {
  id: 'session-1',
  project_id: PROJECT.id,
  project_path: PROJECT.path,
  created_at: 1,
  title: 'Original title',
}

const SECOND_PROJECT = {
  id: 'project-2',
  path: '/workspace/project-2',
  sessions: [],
  created_at: 0,
}

const WORK_PROJECT = {
  id: 'work-project',
  path: '/Users/me',
  name: 'work',
  is_home: true,
  sessions: [],
  created_at: 0,
}

beforeEach(async () => {
  localStorage.clear()
  await sessionPersistence.initialize()
  useWorkbenchStore.getState().reset()
  vi.mocked(requestFromDesktop).mockImplementation(async (command, params) => {
    if (command === 'claudeListProjects') return [PROJECT, WORK_PROJECT]
    if (command === 'claudeListSessions') {
      const { projectId } = params as { projectId: string }
      return projectId === PROJECT.id ? [REMOTE_SESSION] : []
    }
    if (command === 'claudeGetProjectGitBranch') return null
    return undefined
  })
})

afterEach(() => {
  vi.mocked(requestFromDesktop).mockReset()
  useWorkbenchStore.getState().reset()
})

describe('useProjects session actions', () => {
  it('resolves the initial unselected draft onto the work default project', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    const state = useWorkbenchStore.getState()
    expect(state.currentProjectId).toBe(WORK_PROJECT.id)
    const session = state.currentSessionId ? state.sessions[state.currentSessionId] : undefined
    expect(session).toMatchObject({ project_id: WORK_PROJECT.id, project_path: WORK_PROJECT.path })
    expect(result.current.projects.find((project) => project.is_home)?.id).toBe(WORK_PROJECT.id)
  })

  it('keeps a single project session failure out of the global startup error', async () => {
    vi.mocked(requestFromDesktop).mockImplementation(async (command, params) => {
      if (command === 'claudeListProjects') return [PROJECT, SECOND_PROJECT]
      if (command === 'claudeListSessions') {
        const { projectId } = params as { projectId: string }
        if (projectId === SECOND_PROJECT.id) throw new Error('Project sessions failed')
        return [REMOTE_SESSION]
      }
      if (command === 'claudeGetProjectGitBranch') return null
      return undefined
    })

    const { result } = renderHook(() => useProjects())

    expect(result.current.isInitialLoading).toBe(true)
    await waitFor(() => expect(result.current.isInitialLoading).toBe(false))
    expect(result.current.projectListError).toBeNull()
    expect(result.current.projectSessionErrors).toEqual({
      [SECOND_PROJECT.id]: 'Project sessions failed',
    })
    expect(result.current.projects.map((project) => project.id)).toEqual(
      expect.arrayContaining([PROJECT.id, SECOND_PROJECT.id]),
    )
  })

  it('clears a project session error after a successful retry', async () => {
    let shouldFail = true
    vi.mocked(requestFromDesktop).mockImplementation(async (command, params) => {
      if (command === 'claudeListProjects') return [PROJECT]
      if (command === 'claudeListSessions') {
        const { projectId } = params as { projectId: string }
        if (projectId === PROJECT.id && shouldFail) {
          throw new Error('Project sessions failed')
        }
        return [REMOTE_SESSION]
      }
      if (command === 'claudeGetProjectGitBranch') return null
      return undefined
    })

    const { result } = renderHook(() => useProjects())
    await waitFor(() =>
      expect(result.current.projectSessionErrors).toEqual({
        [PROJECT.id]: 'Project sessions failed',
      }),
    )

    shouldFail = false
    await act(() => result.current.refreshProjects())

    expect(result.current.projectSessionErrors).toEqual({})
    expect(useWorkbenchStore.getState().sessions[REMOTE_SESSION.id]).toBeDefined()
  })

  it('ignores an older refresh result that finishes after a newer refresh', async () => {
    const pendingProjectLists: Array<{
      promise: Promise<(typeof PROJECT)[]>
      resolve: (projects: (typeof PROJECT)[]) => void
    }> = []
    let projectListRequestCount = 0

    vi.mocked(requestFromDesktop).mockImplementation(async (command, params) => {
      if (command === 'claudeListProjects') {
        projectListRequestCount += 1
        if (projectListRequestCount === 1) return [PROJECT]

        let resolve!: (projects: (typeof PROJECT)[]) => void
        const promise = new Promise<(typeof PROJECT)[]>((complete) => {
          resolve = complete
        })
        pendingProjectLists.push({ promise, resolve })
        return promise
      }
      if (command === 'claudeListSessions') {
        const { projectId } = params as { projectId: string }
        return projectId === PROJECT.id ? [REMOTE_SESSION] : []
      }
      if (command === 'claudeGetProjectGitBranch') return null
      return undefined
    })

    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let olderRefresh!: Promise<void>
    let newerRefresh!: Promise<void>
    act(() => {
      olderRefresh = result.current.refreshProjects()
      newerRefresh = result.current.refreshProjects()
    })
    await waitFor(() => expect(pendingProjectLists).toHaveLength(2))

    await act(async () => {
      pendingProjectLists[1].resolve([SECOND_PROJECT])
      await newerRefresh
    })
    await act(async () => {
      pendingProjectLists[0].resolve([PROJECT])
      await olderRefresh
    })

    expect(result.current.projects.map((project) => project.id)).toContain(SECOND_PROJECT.id)
    expect(result.current.projects.map((project) => project.id)).not.toContain(PROJECT.id)
    expect(result.current.isLoading).toBe(false)
  })

  it('keeps initial loading complete while a background refresh is pending', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    let finishProjects!: (projects: (typeof PROJECT)[]) => void
    const projects = new Promise<(typeof PROJECT)[]>((resolve) => {
      finishProjects = resolve
    })
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'claudeListProjects') return projects
      if (command === 'claudeListSessions') return [REMOTE_SESSION]
      if (command === 'claudeGetProjectGitBranch') return null
      return undefined
    })

    let refresh!: Promise<void>
    act(() => {
      refresh = result.current.refreshProjects()
    })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.hasLoadedCatalog).toBe(true)
    expect(result.current.isInitialLoading).toBe(false)

    await act(async () => {
      finishProjects([PROJECT])
      await refresh
    })
  })

  it('renames a remote session through the SDK after the desktop request succeeds', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const session = useWorkbenchStore.getState().sessions[REMOTE_SESSION.id]
    vi.mocked(requestFromDesktop).mockClear()

    expect(result.current.renameSession).toBeTypeOf('function')
    await act(() => result.current.renameSession?.(session.id, 'Renamed session'))

    expect(requestFromDesktop).toHaveBeenCalledWith('claudeRenameSession', {
      projectId: PROJECT.id,
      sessionId: REMOTE_SESSION.id,
      title: 'Renamed session',
    })
    expect(useWorkbenchStore.getState().sessions[REMOTE_SESSION.id]?.title).toBe('Renamed session')
  })

  it('renames a draft locally without sending a desktop request', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    let draftId = ''
    act(() => {
      draftId = useWorkbenchStore.getState().createDraftSession(PROJECT.id, 'Draft title')
    })
    const draft = useWorkbenchStore.getState().sessions[draftId]
    vi.mocked(requestFromDesktop).mockClear()

    expect(result.current.renameSession).toBeTypeOf('function')
    await act(() => result.current.renameSession?.(draft.id, 'Local draft'))

    expect(requestFromDesktop).not.toHaveBeenCalledWith('claudeRenameSession', expect.anything())
    expect(useWorkbenchStore.getState().sessions[draftId]?.title).toBe('Local draft')
  })

  it('deletes a remote session only after the desktop request succeeds', async () => {
    const { result } = renderHook(() => useProjects())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    const session = useWorkbenchStore.getState().sessions[REMOTE_SESSION.id]

    expect(result.current.deleteSession).toBeTypeOf('function')
    await act(() => result.current.deleteSession?.(session.id))

    expect(requestFromDesktop).toHaveBeenCalledWith('claudeDeleteSession', {
      projectId: PROJECT.id,
      sessionId: REMOTE_SESSION.id,
    })
    expect(useWorkbenchStore.getState().sessions[REMOTE_SESSION.id]).toBeUndefined()
  })
})
