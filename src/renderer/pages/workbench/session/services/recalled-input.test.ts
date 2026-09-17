// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import type { SessionController } from '../session-controller'
import type { ClaudeJsonLine } from './message'
import { RecalledInputService } from './recalled-input'

const userPrompt = (uuid: string, text: string) =>
  ({
    type: 'user',
    uuid,
    message: { role: 'user', content: [{ type: 'text', text }] },
  }) as ClaudeJsonLine

const assistantReply = (uuid: string) =>
  ({
    type: 'assistant',
    uuid,
    message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
  }) as ClaudeJsonLine

function createController({
  history,
  recalledUuid,
}: {
  history: ClaudeJsonLine[]
  recalledUuid: string | null
}) {
  const claudeService = {
    loadSessionHistory: vi.fn(async () => history),
    dropTrailingTurn: vi.fn(async () => ({ dropped: true, removedSession: false })),
  }
  const historyService = {
    recalledMessageUuid: recalledUuid,
    clearRecalledTail: vi.fn(),
    markFreshSession: vi.fn(),
  }
  const composerService = { clearRecalledMessage: vi.fn(async () => {}) }
  const controller = {
    contextStore: { getState: () => ({ claudeSessionId: 'claude-1', projectId: 'project-1' }) },
    followService: { stop: vi.fn() },
    claudeService,
    historyService,
    composerService,
  } as unknown as SessionController
  return { claudeService, composerService, controller, historyService }
}

describe('RecalledInputService.clear', () => {
  it('targets the recorded recalled message, never a newer prompt from another client', async () => {
    const { claudeService, controller, historyService } = createController({
      history: [userPrompt('recalled', 'old question'), userPrompt('newer', 'from another client')],
      recalledUuid: 'recalled',
    })
    // The backend refuses to drop a turn that has newer conversation after it.
    claudeService.dropTrailingTurn.mockResolvedValue({ dropped: false, removedSession: false })

    await expect(new RecalledInputService(controller).clear()).rejects.toThrow(
      'Failed to remove the unanswered turn',
    )
    expect(claudeService.dropTrailingTurn).toHaveBeenCalledWith({
      projectId: 'project-1',
      sessionId: 'claude-1',
      userMessageUuid: 'recalled',
    })
    // The marker survives so the next send retries instead of resuming with
    // the cancelled turn in context.
    expect(historyService.clearRecalledTail).not.toHaveBeenCalled()
  })

  it('clears the marker without dropping when the recorded turn was answered elsewhere', async () => {
    const { claudeService, composerService, controller, historyService } = createController({
      history: [userPrompt('recalled', 'question'), assistantReply('answer')],
      recalledUuid: 'recalled',
    })

    await expect(new RecalledInputService(controller).clear()).resolves.toBe(false)
    expect(claudeService.dropTrailingTurn).not.toHaveBeenCalled()
    expect(historyService.clearRecalledTail).toHaveBeenCalled()
    expect(composerService.clearRecalledMessage).toHaveBeenCalled()
  })

  it('falls back to the trailing prompt when the cancellation snapshot captured no uuid', async () => {
    const { claudeService, controller, historyService } = createController({
      history: [
        userPrompt('answered', 'first'),
        assistantReply('reply'),
        userPrompt('trailing', 'second'),
      ],
      recalledUuid: null,
    })

    await expect(new RecalledInputService(controller).clear()).resolves.toBe(false)
    expect(claudeService.dropTrailingTurn).toHaveBeenCalledWith(
      expect.objectContaining({ userMessageUuid: 'trailing' }),
    )
    expect(historyService.clearRecalledTail).toHaveBeenCalled()
  })

  it('clears the marker when the recorded message is already gone from the transcript', async () => {
    const { claudeService, controller, historyService } = createController({
      history: [userPrompt('other', 'question'), assistantReply('answer')],
      recalledUuid: 'missing',
    })

    await expect(new RecalledInputService(controller).clear()).resolves.toBe(false)
    expect(claudeService.dropTrailingTurn).not.toHaveBeenCalled()
    expect(historyService.clearRecalledTail).toHaveBeenCalled()
  })
})
