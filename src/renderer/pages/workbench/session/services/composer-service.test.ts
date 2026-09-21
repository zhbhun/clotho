import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalSession } from '@/shared/session'

import { requestFromDesktop } from '../../../../services/desktop/client'
import { createSessionPersistence } from '../../services/session-persistence'
import { useWorkbenchStore } from '../../stores/workbench-store'
import { createSessionController } from '../session-controller'

vi.mock('../../../../services/desktop/client', () => ({
  isDesktopRuntime: () => true,
  requestFromDesktop: vi.fn(async () => null),
  listenDesktopEvent: vi.fn(() => Promise.resolve(() => {})),
}))

const attachment = { name: 'diagram.png', path: '/project/diagram.png' }

/** Let the write-behind queue settle so flush() sees the dirty records. */
const settleQueue = () => new Promise((resolve) => setTimeout(resolve, 0))

function createSpyPersistence() {
  const writes: Array<{ sessionId: string; data: LocalSession }> = []
  const deletes: string[] = []
  const persistence = createSessionPersistence({
    readLocalSession: async () => null,
    writeLocalSession: async (sessionId, data) => {
      writes.push({ sessionId, data })
    },
    deleteLocalSession: async (sessionId) => {
      deletes.push(sessionId)
    },
  })
  return { deletes, persistence, writes }
}

function createUnsavedDraftController(
  sessionId: string,
  persistence: ReturnType<typeof createSessionPersistence>,
) {
  const controller = createSessionController({
    sessionId,
    claudeSessionId: null,
    projectId: null,
    projectPath: null,
    isHomeMode: true,
    isMockProject: false,
    persistence,
  })
  return controller
}

describe('composer attachments', () => {
  it('preserves attachments independently of prompt edits and restores them with the draft', async () => {
    const persistence = createSessionPersistence(undefined)
    const options = {
      sessionId: 'attachment-draft',
      claudeSessionId: null,
      projectId: null,
      projectPath: null,
      isHomeMode: true,
      isMockProject: false,
      persistence,
    }
    const controller = createSessionController(options)
    controller.setAttachments([attachment])
    controller.setPrompt('Look at @src/app.tsx')
    await persistence.flush()

    expect(controller.composerService.snapshot()).toMatchObject({
      prompt: 'Look at @src/app.tsx',
      attachments: [attachment],
    })
    const restored = createSessionController(options)
    expect(restored.composerStore.getState().attachments).toEqual([attachment])
    restored.resetPreferences()
    expect(restored.composerStore.getState().attachments).toEqual([])
    controller.dispose()
    restored.dispose()
  })
})

describe('hidden draft persistence', () => {
  afterEach(() => {
    useWorkbenchStore.getState().reset()
  })

  it('persists typed content right away while the draft stays hidden', async () => {
    const sessionId = useWorkbenchStore.getState().createDraftSession(null)
    const { persistence, writes } = createSpyPersistence()
    const controller = createUnsavedDraftController(sessionId, persistence)

    controller.composerService.setPrompt('hello world')
    await settleQueue()
    await persistence.flush()

    const write = writes.find((entry) => entry.sessionId === sessionId)
    expect(write?.data.input.prompt).toBe('hello world')
    expect(vi.mocked(requestFromDesktop)).toHaveBeenCalledWith(
      'sessionUpdateDraft',
      expect.objectContaining({ sessionId }),
    )
    // The draft remains hidden from tabs and history until it materializes.
    expect(useWorkbenchStore.getState().sessions[sessionId]?.isUnsavedDraft).toBe(true)
    controller.dispose()
  })

  it('derives the hidden index title from the first prompt line', async () => {
    const sessionId = useWorkbenchStore.getState().createDraftSession(null)
    const { persistence } = createSpyPersistence()
    const controller = createUnsavedDraftController(sessionId, persistence)

    controller.composerService.setPrompt('first line\nsecond line')
    await persistence.flush()

    expect(vi.mocked(requestFromDesktop)).toHaveBeenCalledWith('sessionUpdateDraft', {
      sessionId,
      draft: expect.objectContaining({ title: 'first line' }),
    })
    controller.dispose()
  })

  it('keeps a blank draft out of storage', async () => {
    const sessionId = useWorkbenchStore.getState().createDraftSession(null)
    const { persistence, writes } = createSpyPersistence()
    const controller = createUnsavedDraftController(sessionId, persistence)

    controller.composerService.setPrompt('   ')
    await persistence.flush()

    expect(writes).toEqual([])
    expect(vi.mocked(requestFromDesktop)).not.toHaveBeenCalledWith(
      'sessionUpdateDraft',
      expect.objectContaining({ sessionId }),
    )
    controller.dispose()
  })

  it('discards persisted traces when the content is cleared again', async () => {
    const sessionId = useWorkbenchStore.getState().createDraftSession(null)
    const { deletes, persistence, writes } = createSpyPersistence()
    const controller = createUnsavedDraftController(sessionId, persistence)

    controller.composerService.setPrompt('hello')
    await settleQueue()
    await persistence.flush()
    expect(writes.some((entry) => entry.sessionId === sessionId)).toBe(true)

    controller.composerService.setPrompt('')
    await vi.waitFor(() => expect(deletes).toContain(sessionId))

    // Blank again afterwards: no further file writes resurrect the draft.
    const writeCount = writes.length
    controller.composerService.setPrompt('   ')
    await persistence.flush()
    expect(writes.length).toBe(writeCount)
    controller.dispose()
  })
})
