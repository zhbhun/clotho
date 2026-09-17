import { describe, expect, it } from 'vitest'

import { createSendLifecycle, pendingSendSnapshot, transitionSendLifecycle } from './send-lifecycle'

const snapshot = {
  messages: [],
  optimisticMessageId: 'optimistic-1',
  prompt: 'continue',
}

describe('send lifecycle', () => {
  it('uses the real history event as the turn and timing origin', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state

    const confirmation = transitionSendLifecycle(lifecycle, {
      type: 'history-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    })
    lifecycle = confirmation.state

    expect(confirmation.effect).toEqual({
      kind: 'history-confirmed',
      optimisticMessageId: 'optimistic-1',
    })
    // History alone does not confirm a response yet: the turn stays recallable.
    expect(lifecycle).toEqual({
      phase: 'awaiting-response',
      startedAt: 2_000,
      turnId: 'persisted-1',
      snapshot,
    })

    lifecycle = transitionSendLifecycle(lifecycle, {
      type: 'response-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    }).state
    expect(lifecycle).toEqual({
      phase: 'persisted',
      startedAt: 2_000,
      turnId: 'persisted-1',
      snapshot,
    })
  })

  it('keeps recalling after history lands when no response streamed', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, { type: 'stop-requested' }).state

    const confirmation = transitionSendLifecycle(lifecycle, {
      type: 'history-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    })
    lifecycle = confirmation.state

    expect(confirmation.effect).toEqual({
      kind: 'history-confirmed',
      optimisticMessageId: 'optimistic-1',
    })
    expect(lifecycle).toEqual({ phase: 'recall-requested', snapshot })

    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'error',
      message: 'Interrupted',
      finishedAt: 12_900,
    })
    expect(finished.effect).toEqual({
      activity: 'idle',
      kind: 'recalled',
      snapshot,
    })
  })

  it('converts a pending recall into a persisted stop when content arrives after the stop', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, { type: 'stop-requested' }).state
    lifecycle = transitionSendLifecycle(lifecycle, {
      type: 'response-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    }).state

    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'error',
      message: 'Interrupted',
      finishedAt: 12_900,
    })

    expect(finished.state).toEqual({ phase: 'idle' })
    expect(finished.effect).toEqual({
      activity: 'idle',
      elapsed: 10,
      kind: 'stopped',
      turnId: 'persisted-1',
    })
  })

  it('recalls when stopped after history but before any response', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, {
      type: 'history-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, { type: 'stop-requested' }).state

    expect(lifecycle).toEqual({ phase: 'recall-requested', snapshot })

    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'error',
      message: 'Interrupted',
      finishedAt: 3_000,
    })

    expect(finished.effect).toEqual({
      activity: 'idle',
      kind: 'recalled',
      snapshot,
    })
  })

  it('recalls the optimistic message when a normal query ends before history exists', () => {
    const lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state

    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'success',
      finishedAt: 1_000,
    })

    expect(finished.state).toEqual({ phase: 'idle' })
    expect(finished.effect).toEqual({
      activity: 'error',
      error: 'Claude did not write the message to conversation history',
      kind: 'recalled',
      snapshot,
    })
  })

  it('recalls without an error when the user stops before history exists', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, { type: 'stop-requested' }).state

    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'error',
      message: 'Interrupted',
      finishedAt: 1_000,
    })

    expect(finished.effect).toEqual({
      activity: 'idle',
      kind: 'recalled',
      snapshot,
    })
  })

  it('attaches a technical failure to the persisted turn using canonical elapsed time', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, {
      type: 'history-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    }).state

    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'error',
      message: 'model offline',
      finishedAt: 12_900,
    })

    expect(finished.effect).toEqual({
      activity: 'error',
      elapsed: 10,
      kind: 'failed',
      message: 'model offline',
      turnId: 'persisted-1',
    })
  })

  it('completes a turn once any agent content streamed', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, {
      type: 'history-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    }).state

    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'success',
      finishedAt: 12_900,
    })

    expect(finished).toEqual({
      state: { phase: 'idle' },
      effect: { activity: 'success', kind: 'completed' },
    })
  })

  it('accepts a response as confirmation when the SDK omits the user history event', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, {
      type: 'response-confirmed',
      turnId: 'optimistic-1',
      startedAt: 2_000,
    }).state

    expect(lifecycle).toEqual({
      phase: 'persisted',
      turnId: 'optimistic-1',
      startedAt: 2_000,
      snapshot,
    })

    expect(
      transitionSendLifecycle(lifecycle, {
        type: 'finished',
        result: 'success',
        finishedAt: 3_000,
      }),
    ).toEqual({
      state: { phase: 'idle' },
      effect: { activity: 'success', kind: 'completed' },
    })
  })

  it('still reconciles real history after a response confirms the optimistic turn', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot,
    }).state
    lifecycle = transitionSendLifecycle(lifecycle, {
      type: 'response-confirmed',
      turnId: 'optimistic-1',
      startedAt: 1_000,
    }).state

    const confirmation = transitionSendLifecycle(lifecycle, {
      type: 'history-confirmed',
      turnId: 'persisted-1',
      startedAt: 2_000,
    })

    expect(confirmation).toEqual({
      state: { phase: 'persisted', turnId: 'persisted-1', startedAt: 2_000, snapshot },
      effect: { kind: 'history-confirmed', optimisticMessageId: 'optimistic-1' },
    })
  })

  it('starts a synthetic nudge confirmed and stops it on the resumed turn', () => {
    let lifecycle = transitionSendLifecycle(createSendLifecycle(), {
      type: 'begin',
      snapshot: { ...snapshot, isSynthetic: true },
      confirmed: { turnId: 'resumed-1', startedAt: 1_000 },
    }).state

    expect(lifecycle).toEqual({
      phase: 'persisted',
      turnId: 'resumed-1',
      startedAt: 1_000,
      snapshot: { ...snapshot, isSynthetic: true },
    })
    expect(pendingSendSnapshot(lifecycle)?.isSynthetic).toBe(true)

    lifecycle = transitionSendLifecycle(lifecycle, { type: 'stop-requested' }).state
    const finished = transitionSendLifecycle(lifecycle, {
      type: 'finished',
      result: 'error',
      message: 'Interrupted',
      finishedAt: 4_000,
    })

    expect(finished.effect).toEqual({
      activity: 'idle',
      elapsed: 3,
      kind: 'stopped',
      turnId: 'resumed-1',
    })
  })
})
