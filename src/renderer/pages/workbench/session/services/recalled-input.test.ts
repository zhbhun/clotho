// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import type { SessionController } from '../session-controller'
import { RecalledInputService } from './recalled-input'

function createController() {
  const historyService = {
    hasRecalledTail: true,
    markRecalledTail: vi.fn(),
  }
  const composerService = {
    restorePrompt: vi.fn(async () => {}),
    markRecalledMessage: vi.fn(async () => {}),
  }
  const controller = {
    contextStore: { getState: () => ({ claudeSessionId: 'claude-1', projectId: 'project-1' }) },
    historyService,
    composerService,
  } as unknown as SessionController
  return { composerService, controller, historyService }
}

describe('RecalledInputService.record', () => {
  it('marks the recalled tail and restores the prompt to the composer', async () => {
    const { composerService, controller, historyService } = createController()

    await new RecalledInputService(controller).record(
      {
        messages: [],
        optimisticMessageId: 'local-user-1',
        userMessageUuid: 'sent-user-uuid',
        prompt: 'hello?',
        attachments: [],
      },
      true,
    )

    expect(historyService.markRecalledTail).toHaveBeenCalledWith('sent-user-uuid')
    expect(composerService.restorePrompt).toHaveBeenCalledWith('hello?', [], 'sent-user-uuid')
  })

  it('only marks the retained message when the composer keeps its own draft', async () => {
    const { composerService, controller, historyService } = createController()

    await new RecalledInputService(controller).record(
      {
        messages: [],
        optimisticMessageId: 'local-user-1',
        userMessageUuid: 'sent-user-uuid',
        prompt: 'hello?',
      },
      false,
    )

    expect(historyService.markRecalledTail).toHaveBeenCalledWith('sent-user-uuid')
    expect(composerService.restorePrompt).not.toHaveBeenCalled()
    expect(composerService.markRecalledMessage).toHaveBeenCalledWith('sent-user-uuid')
  })

  it('never records a synthetic nudge as a recalled prompt', async () => {
    const { composerService, controller, historyService } = createController()

    await new RecalledInputService(controller).record(
      {
        messages: [],
        optimisticMessageId: 'local-nudge-1',
        prompt: 'resume',
        isSynthetic: true,
      },
      true,
    )

    expect(historyService.markRecalledTail).not.toHaveBeenCalled()
    expect(composerService.restorePrompt).not.toHaveBeenCalled()
  })
})
