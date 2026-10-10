import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionController } from '../session-controller'
import {
  type SendLifecycle,
  createSendLifecycle,
  transitionSendLifecycle,
} from '../stores/send-lifecycle'
import { TurnStreamService } from './turn-stream'

function createController(setState: ReturnType<typeof vi.fn>, optimisticTimestamp?: string) {
  return {
    conversationStore: { getState: () => ({ interruptedTurnIds: new Set<string>() }) },
    historyService: {
      ingestLine: vi.fn(),
      optimisticTimestamp: vi.fn(() => optimisticTimestamp),
      replaceOptimisticMessage: vi.fn(),
      flushPendingPublish: vi.fn(),
    },
    runtimeStore: { setState },
  } as unknown as SessionController
}

function beginLifecycle(snapshotState: SendLifecycle) {
  const lifecycle = { state: snapshotState }
  lifecycle.state = transitionSendLifecycle(lifecycle.state, {
    type: 'begin',
    snapshot: { messages: [], optimisticMessageId: 'opt-1', prompt: 'hi' },
  }).state
  return lifecycle
}

describe('TurnStreamService', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ticks from the optimistic prompt timestamp before history confirms', () => {
    vi.useFakeTimers()
    const setState = vi.fn()
    const service = new TurnStreamService(
      createController(setState, '2026-10-10T08:00:00.000Z'),
      () => beginLifecycle(createSendLifecycle()).state,
      () => undefined,
    )

    service.startElapsedTicker()
    vi.advanceTimersByTime(450)
    service.stop()
    vi.advanceTimersByTime(450)

    expect(setState).toHaveBeenCalledWith({ streamingElapsed: expect.any(Number) })
    const callsAfterStop = setState.mock.calls.length
    vi.advanceTimersByTime(200)
    expect(setState).toHaveBeenCalledTimes(callsAfterStop)
  })

  it('does not start without a timing origin', () => {
    vi.useFakeTimers()
    const setState = vi.fn()
    const service = new TurnStreamService(
      createController(setState),
      () => createSendLifecycle(),
      () => undefined,
    )

    service.startElapsedTicker()
    vi.advanceTimersByTime(450)

    expect(setState).not.toHaveBeenCalled()
  })
})
