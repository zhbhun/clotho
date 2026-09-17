import type { ClaudeAttachment } from '@/shared/rpc'

import type { ClaudeMessage } from '../services/message'

export type SendSnapshot = {
  messages: ClaudeMessage[]
  optimisticMessageId: string
  userMessageUuid?: string
  prompt: string
  attachments?: ClaudeAttachment[]
  /**
   * Synthetic sends (the auto-continuation nudge) display no user turn, so a
   * stop always marks the resumed turn stopped instead of recalling a prompt.
   */
  isSynthetic?: boolean
}

export type SendLifecycle =
  | { phase: 'idle' }
  | { phase: 'awaiting-history'; snapshot: SendSnapshot }
  | { phase: 'recall-requested'; snapshot: SendSnapshot }
  | { phase: 'awaiting-response'; turnId: string; startedAt: number; snapshot: SendSnapshot }
  | { phase: 'persisted'; turnId: string; startedAt: number; snapshot?: SendSnapshot }
  | { phase: 'stop-requested'; turnId: string; startedAt: number; snapshot?: SendSnapshot }

export type SendLifecycleEvent =
  | { type: 'begin'; snapshot: SendSnapshot; confirmed?: { turnId: string; startedAt: number } }
  | { type: 'history-confirmed'; turnId: string; startedAt: number }
  | { type: 'response-confirmed'; turnId: string; startedAt: number }
  | { type: 'stop-requested' }
  | {
      type: 'finished'
      result: 'success' | 'error'
      message?: string
      finishedAt: number
    }

export type SendLifecycleEffect =
  | { kind: 'history-confirmed'; optimisticMessageId: string }
  | { kind: 'completed'; activity: 'success' }
  | { kind: 'stopped'; turnId: string; elapsed: number; activity: 'idle' }
  | {
      kind: 'recalled'
      snapshot: SendSnapshot
      error?: string
      activity: 'idle' | 'error'
    }
  | {
      kind: 'failed'
      turnId: string
      elapsed: number
      message: string
      activity: 'error'
    }

export function createSendLifecycle(): SendLifecycle {
  return { phase: 'idle' }
}

export function transitionSendLifecycle(
  state: SendLifecycle,
  event: SendLifecycleEvent,
): { state: SendLifecycle; effect?: SendLifecycleEffect } {
  if (event.type === 'begin') {
    // A confirmed begin (synthetic nudge) resumes a turn that already exists in
    // history, so it starts response-pending and can never be recalled.
    return {
      state: event.confirmed
        ? {
            phase: 'persisted',
            turnId: event.confirmed.turnId,
            startedAt: event.confirmed.startedAt,
            snapshot: event.snapshot,
          }
        : { phase: 'awaiting-history', snapshot: event.snapshot },
    }
  }
  if (event.type === 'stop-requested') {
    if (state.phase === 'awaiting-history' || state.phase === 'awaiting-response') {
      // No agent content has arrived for this turn, so recall only this
      // trailing prompt. The transcript cleanup decides whether the session
      // file itself can be removed (only when this was the first turn).
      return { state: { phase: 'recall-requested', snapshot: state.snapshot } }
    }
    if (state.phase === 'persisted') {
      return {
        state: {
          phase: 'stop-requested',
          turnId: state.turnId,
          startedAt: state.startedAt,
          snapshot: state.snapshot,
        },
      }
    }
    return { state }
  }
  if (event.type === 'history-confirmed') {
    const snapshot = 'snapshot' in state ? state.snapshot : undefined
    if (!snapshot) return { state }
    if (state.phase === 'recall-requested' || state.phase === 'stop-requested') {
      return {
        state,
        effect: {
          kind: 'history-confirmed',
          optimisticMessageId: snapshot.optimisticMessageId,
        },
      }
    }
    return {
      state: {
        phase: state.phase === 'persisted' ? 'persisted' : 'awaiting-response',
        turnId: event.turnId,
        startedAt: event.startedAt,
        snapshot,
      },
      effect: {
        kind: 'history-confirmed',
        optimisticMessageId: snapshot.optimisticMessageId,
      },
    }
  }
  if (event.type === 'response-confirmed') {
    // Content streamed after a stop request converts the pending recall into a
    // stopped turn: the partial reply is worth keeping in the conversation.
    if (state.phase === 'awaiting-response') {
      // The real user history timestamp stays the timing origin.
      return { state: { ...state, phase: 'persisted' } }
    }
    if (state.phase === 'awaiting-history' || state.phase === 'recall-requested') {
      return {
        state: {
          phase: state.phase === 'recall-requested' ? 'stop-requested' : 'persisted',
          turnId: event.turnId,
          startedAt: event.startedAt,
          snapshot: state.snapshot,
        },
      }
    }
    return { state }
  }
  if (event.type === 'finished' && state.phase === 'stop-requested') {
    return {
      state: createSendLifecycle(),
      effect: {
        kind: 'stopped',
        turnId: state.turnId,
        elapsed: Math.max(0, Math.floor((event.finishedAt - state.startedAt) / 1000)),
        activity: 'idle',
      },
    }
  }
  if (event.type === 'finished' && state.phase === 'awaiting-history') {
    return {
      state: createSendLifecycle(),
      effect: {
        kind: 'recalled',
        snapshot: state.snapshot,
        error:
          event.result === 'error'
            ? (event.message ?? 'Failed to execute Claude')
            : 'Claude did not write the message to conversation history',
        activity: 'error',
      },
    }
  }
  if (event.type === 'finished' && state.phase === 'recall-requested') {
    return {
      state: createSendLifecycle(),
      effect: {
        kind: 'recalled',
        snapshot: state.snapshot,
        activity: 'idle',
      },
    }
  }
  if (
    event.type === 'finished' &&
    (state.phase === 'awaiting-response' || state.phase === 'persisted') &&
    event.result === 'error'
  ) {
    return {
      state: createSendLifecycle(),
      effect: {
        kind: 'failed',
        turnId: state.turnId,
        elapsed: Math.max(0, Math.floor((event.finishedAt - state.startedAt) / 1000)),
        message: event.message ?? 'Failed to execute Claude',
        activity: 'error',
      },
    }
  }
  if (
    event.type === 'finished' &&
    (state.phase === 'awaiting-response' || state.phase === 'persisted')
  ) {
    return {
      state: createSendLifecycle(),
      effect: { kind: 'completed', activity: 'success' },
    }
  }
  return { state }
}

export function pendingSendSnapshot(state: SendLifecycle): SendSnapshot | null {
  return 'snapshot' in state && state.snapshot ? state.snapshot : null
}

export function sendLifecycleStartedAt(state: SendLifecycle): number | null {
  return state.phase === 'awaiting-response' ||
    state.phase === 'persisted' ||
    state.phase === 'stop-requested'
    ? state.startedAt
    : null
}

export function isSendCancellationRequested(state: SendLifecycle): boolean {
  return state.phase === 'recall-requested' || state.phase === 'stop-requested'
}
