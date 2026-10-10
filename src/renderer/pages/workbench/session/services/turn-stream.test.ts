import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionController } from '../session-controller'
import { createSendLifecycle, transitionSendLifecycle } from '../stores/send-lifecycle'
import { TurnStreamService } from './turn-stream'

function createController(setState: ReturnType<typeof vi.fn>) {
  return {
    conversationStore: { getState: () => ({ interruptedTurnIds: new Set<string>() }) },
    historyService: {
      ingestLine: vi.fn(() => ({
        isAgentEvent: false,
        isApiRetry: false,
        isLocalCommandResult: false,
        rootUserHistory: {
          message: {
            id: 'user-1',
            uuid: 'uuid-1',
            role: 'user',
            content: 'hi',
            timestamp: '2026-10-10T08:00:00.000Z',
          },
        },
        wasSuppressed: false,
      })),
      replaceOptimisticMessage: vi.fn(),
    },
    runtimeStore: { setState },
  } as unknown as SessionController
}

describe('TurnStreamService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts the elapsed ticker once history confirms the sent prompt', () => {
    vi.useFakeTimers()
    const setState = vi.fn()
    const lifecycle = { state: createSendLifecycle() }
    const service = new TurnStreamService(
      createController(setState),
      () => lifecycle.state,
      (event) => {
        const result = transitionSendLifecycle(lifecycle.state, event)
        lifecycle.state = result.state
        return result.effect
      },
    )

    lifecycle.state = transitionSendLifecycle(lifecycle.state, {
      type: 'begin',
      snapshot: { messages: [], optimisticMessageId: 'opt-1', prompt: 'hi' },
    }).state

    service.processLine('{"type":"user","timestamp":"2026-10-10T08:00:00.000Z"}')
    vi.advanceTimersByTime(450)
    service.stop()

    expect(setState).toHaveBeenCalledWith({ streamingElapsed: expect.any(Number) })
  })
})
