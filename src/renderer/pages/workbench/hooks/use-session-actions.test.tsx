import { act, renderHook } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestFromDesktop } from '../../../services/desktop/client'
import { useWorkbenchStore } from '../stores/workbench-store'
import { useSessionActions } from './use-session-actions'

vi.mock('../../../services/desktop/client', () => ({
  isDesktopRuntime: () => true,
  requestFromDesktop: vi.fn(),
  listenDesktopEvent: vi.fn(() => Promise.resolve(() => {})),
}))

function setup() {
  return renderHook(() =>
    useSessionActions({
      closeSession: vi.fn(),
      onError: vi.fn(),
      refreshProjects: vi.fn(async () => {}),
      removeSession: vi.fn(),
      selectSession: vi.fn(),
      setSessionTitle: vi.fn(),
      togglePinSession: vi.fn(),
    }),
  )
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
