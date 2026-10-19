import { act, renderHook } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestFromDesktop } from '../../../services/desktop/client'
import { type WorkbenchSession, useWorkbenchStore } from '../stores/workbench-store'
import { useSessionActions } from './use-session-actions'

vi.mock('../../../services/desktop/client', () => ({
  isDesktopRuntime: () => true,
  requestFromDesktop: vi.fn(),
  listenDesktopEvent: vi.fn(() => Promise.resolve(() => {})),
}))

function setup(overrides: Partial<Parameters<typeof useSessionActions>[0]> = {}) {
  return renderHook(() =>
    useSessionActions({
      closeSession: vi.fn(),
      onError: vi.fn(),
      refreshProjects: vi.fn(async () => {}),
      removeSession: vi.fn(),
      selectSession: vi.fn(),
      setSessionTitle: vi.fn(),
      setSessionsArchived: useWorkbenchStore.getState().setSessionsArchived,
      togglePinSession: vi.fn(),
      ...overrides,
    }),
  )
}

function storeSession(id: string, claudeSessionId: string | null): WorkbenchSession {
  return {
    id,
    claudeSessionId,
    project_id: 'project-1',
    project_path: '/workspace/project-1',
    created_at: 0,
    title: id,
  }
}

beforeEach(() => {
  useWorkbenchStore.getState().reset()
  vi.mocked(requestFromDesktop).mockReset()
  vi.mocked(requestFromDesktop).mockResolvedValue(undefined)
})

describe('useSessionActions deleteSession on drafts', () => {
  it('uses the persisted binding when the card lost its in-memory one', async () => {
    const draftId = useWorkbenchStore.getState().createDraftSession('project-1')
    // A catalog refresh rebuilds draft cards from the index without the binding.
    expect(useWorkbenchStore.getState().sessions[draftId].claudeSessionId).toBeNull()
    vi.mocked(requestFromDesktop).mockImplementation(async (command) => {
      if (command === 'sessionRead') {
        return {
          projectId: 'project-1',
          projectPath: '/workspace/project-1',
          claudeSessionId: 'bound-claude-id',
          input: {
            prompt: '',
            attachments: [],
            model: null,
            permissionMode: 'default',
            agent: null,
          },
        }
      }
      return undefined
    })
    const { result } = setup()

    await act(async () => {
      await result.current.deleteSession(draftId)
    })

    expect(requestFromDesktop).toHaveBeenCalledWith('claudeDeleteSession', {
      projectId: 'project-1',
      sessionId: 'bound-claude-id',
    })
  })

  it('falls back to the draft id to probe for a transcript when nothing recorded a binding', async () => {
    const draftId = useWorkbenchStore.getState().createDraftSession('project-1')
    vi.mocked(requestFromDesktop).mockResolvedValue(null)
    const { result } = setup()

    await act(async () => {
      await result.current.deleteSession(draftId)
    })

    expect(requestFromDesktop).toHaveBeenCalledWith('claudeDeleteSession', {
      projectId: 'project-1',
      sessionId: draftId,
    })
  })

  it('prefers the in-memory binding when it is present', async () => {
    const draftId = useWorkbenchStore.getState().createDraftSession('project-1')
    useWorkbenchStore.getState().bindClaudeSession(draftId, 'claude-B')
    const { result } = setup()

    await act(async () => {
      await result.current.deleteSession(draftId)
    })

    expect(requestFromDesktop).toHaveBeenCalledWith('claudeDeleteSession', {
      projectId: 'project-1',
      sessionId: 'claude-B',
    })
    expect(requestFromDesktop).not.toHaveBeenCalledWith('sessionRead', expect.anything())
  })
})

describe('useSessionActions archive', () => {
  it('archives by claude id, flags the store, and unpins archived sessions', async () => {
    useWorkbenchStore.setState({
      sessions: {
        a: storeSession('a', 'claude-a'),
        b: storeSession('b', 'claude-b'),
        draft: { ...storeSession('draft', null), isDraft: true },
      },
      pinnedSessionIds: ['a'],
    })
    const { result } = setup()

    let archivedCount = 0
    await act(async () => {
      const state = useWorkbenchStore.getState()
      archivedCount = await result.current.archiveSessions([
        state.sessions.a,
        state.sessions.b,
        state.sessions.draft,
      ])
    })

    // The unbound draft has no claude session to mark and stays out of the RPC.
    expect(archivedCount).toBe(2)
    expect(requestFromDesktop).toHaveBeenCalledWith('claudeSetSessionsArchived', {
      sessions: [
        { projectId: 'project-1', sessionId: 'claude-a' },
        { projectId: 'project-1', sessionId: 'claude-b' },
      ],
      archived: true,
    })
    const state = useWorkbenchStore.getState()
    expect(state.sessions.a).toMatchObject({ archived: true })
    expect(typeof state.sessions.a.archived_at).toBe('number')
    expect(state.pinnedSessionIds).toEqual([])
  })

  it('unarchives, clearing the mark and recording the grace timestamp', async () => {
    useWorkbenchStore.setState({
      sessions: { a: { ...storeSession('a', 'claude-a'), archived: true, archived_at: 1 } },
      pinnedSessionIds: [],
    })
    const { result } = setup()

    let unarchivedCount = 0
    await act(async () => {
      unarchivedCount = await result.current.unarchiveSessions([
        useWorkbenchStore.getState().sessions.a,
      ])
    })

    expect(unarchivedCount).toBe(1)
    expect(requestFromDesktop).toHaveBeenCalledWith('claudeSetSessionsArchived', {
      sessions: [{ projectId: 'project-1', sessionId: 'claude-a' }],
      archived: false,
    })
    const archived = useWorkbenchStore.getState().sessions.a
    expect(archived.archived).toBeUndefined()
    expect(archived.archived_at).toBeUndefined()
    expect(typeof archived.unarchived_at).toBe('number')
  })

  it('throws and leaves the store untouched when the RPC fails', async () => {
    useWorkbenchStore.setState({
      sessions: { a: storeSession('a', 'claude-a') },
      pinnedSessionIds: [],
    })
    vi.mocked(requestFromDesktop).mockRejectedValueOnce(new Error('RPC down'))
    const { result } = setup()

    await act(async () => {
      await expect(
        result.current.archiveSessions([useWorkbenchStore.getState().sessions.a]),
      ).rejects.toThrow('RPC down')
    })

    expect(useWorkbenchStore.getState().sessions.a.archived).toBeUndefined()
  })
})
