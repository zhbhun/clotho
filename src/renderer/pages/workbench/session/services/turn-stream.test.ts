import { afterEach, describe, expect, it, vi } from 'vitest'

import type { SessionController } from '../session-controller'
import {
  type SendLifecycle,
  createSendLifecycle,
  transitionSendLifecycle,
} from '../stores/send-lifecycle'
import type { HistoryIngestResult } from './history-service'
import { TurnStreamService } from './turn-stream'

function createController(
  setState: ReturnType<typeof vi.fn>,
  optimisticTimestamp?: string,
  pendingToolRequests: Record<string, unknown> = {},
  ingestLine: ReturnType<typeof vi.fn> = vi.fn(() => ingestResult()),
) {
  return {
    conversationStore: { getState: () => ({ interruptedTurnIds: new Set<string>() }) },
    historyService: {
      ingestLine,
      optimisticTimestamp: vi.fn(() => optimisticTimestamp),
      replaceOptimisticMessage: vi.fn(),
      flushPendingPublish: vi.fn(),
    },
    runtimeStore: {
      setState,
      getState: () => ({ pendingToolRequests }),
    },
  } as unknown as SessionController
}

function ingestResult(overrides: Partial<HistoryIngestResult> = {}): HistoryIngestResult {
  return { isAgentEvent: false, isApiRetry: false, isLocalCommandResult: false, ...overrides }
}

const API_RETRY_FRAME = {
  type: 'system',
  subtype: 'api_retry',
  attempt: 3,
  max_retries: 10,
  retry_delay_ms: 5000,
  error_status: 529,
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

  it('fails the turn when an API retry stays silent past its deadline', () => {
    vi.useFakeTimers()
    const onStalled = vi.fn()
    const ingestLine = vi.fn(() => ingestResult({ isApiRetry: true, json: API_RETRY_FRAME }))
    const service = new TurnStreamService(
      createController(vi.fn(), undefined, {}, ingestLine),
      () => beginLifecycle(createSendLifecycle()).state,
      () => undefined,
      onStalled,
    )

    service.processLine(JSON.stringify(API_RETRY_FRAME))
    // Inside the retry's own wait window (delay 5s) plus the safety margin, the
    // chain is still considered alive.
    vi.advanceTimersByTime(60_000)
    expect(onStalled).not.toHaveBeenCalled()

    vi.advanceTimersByTime(120_000)
    expect(onStalled).toHaveBeenCalledTimes(1)
    // One-shot: the callback does not repeat for the same silent chain.
    vi.advanceTimersByTime(200_000)
    expect(onStalled).toHaveBeenCalledTimes(1)
  })

  it('pushes the stall deadline out on every consecutive retry notice', () => {
    vi.useFakeTimers()
    const onStalled = vi.fn()
    const retryResult = ingestResult({ isApiRetry: true, json: API_RETRY_FRAME })
    const ingestLine = vi.fn(() => retryResult)
    const service = new TurnStreamService(
      createController(vi.fn(), undefined, {}, ingestLine),
      () => beginLifecycle(createSendLifecycle()).state,
      () => undefined,
      onStalled,
    )

    service.processLine(JSON.stringify(API_RETRY_FRAME))
    vi.advanceTimersByTime(100_000)
    service.processLine(JSON.stringify(API_RETRY_FRAME))
    vi.advanceTimersByTime(100_000)
    expect(onStalled).not.toHaveBeenCalled()

    vi.advanceTimersByTime(30_000)
    expect(onStalled).toHaveBeenCalledTimes(1)
  })

  it('disarms the stall when a real frame follows the retry', () => {
    vi.useFakeTimers()
    const onStalled = vi.fn()
    const retryResult = ingestResult({ isApiRetry: true, json: API_RETRY_FRAME })
    const ingestLine = vi.fn(() => retryResult)
    const service = new TurnStreamService(
      createController(vi.fn(), undefined, {}, ingestLine),
      () => beginLifecycle(createSendLifecycle()).state,
      () => undefined,
      onStalled,
    )

    service.processLine(JSON.stringify(API_RETRY_FRAME))
    ingestLine.mockReturnValue(ingestResult())
    service.processLine('{"type":"stream_event"}')
    vi.advanceTimersByTime(600_000)

    expect(onStalled).not.toHaveBeenCalled()
  })

  it('does not fire the stall for an idle lifecycle or a pending tool ask', () => {
    vi.useFakeTimers()
    const onStalled = vi.fn()
    const ingestLine = vi.fn(() => ingestResult({ isApiRetry: true, json: API_RETRY_FRAME }))
    const idle = new TurnStreamService(
      createController(vi.fn(), undefined, {}, ingestLine),
      () => createSendLifecycle(),
      () => undefined,
      onStalled,
    )
    const awaitingTool = new TurnStreamService(
      createController(vi.fn(), undefined, { 'tool-1': {} }, ingestLine),
      () => beginLifecycle(createSendLifecycle()).state,
      () => undefined,
      onStalled,
    )

    idle.processLine(JSON.stringify(API_RETRY_FRAME))
    awaitingTool.processLine(JSON.stringify(API_RETRY_FRAME))
    vi.advanceTimersByTime(600_000)

    expect(onStalled).not.toHaveBeenCalled()
  })

  it('drops the stall deadline when the turn stream stops', () => {
    vi.useFakeTimers()
    const onStalled = vi.fn()
    const ingestLine = vi.fn(() => ingestResult({ isApiRetry: true, json: API_RETRY_FRAME }))
    const service = new TurnStreamService(
      createController(vi.fn(), undefined, {}, ingestLine),
      () => beginLifecycle(createSendLifecycle()).state,
      () => undefined,
      onStalled,
    )

    service.processLine(JSON.stringify(API_RETRY_FRAME))
    service.stop()
    vi.advanceTimersByTime(600_000)

    expect(onStalled).not.toHaveBeenCalled()
  })
})
