import type { ClaudeJsonLine } from '@/shared/rpc'

import type { SessionController } from '../session-controller'
import {
  type SendLifecycle,
  type SendLifecycleEffect,
  type SendLifecycleEvent,
  pendingSendSnapshot,
  sendLifecycleStartedAt,
} from '../stores/send-lifecycle'
import { type ClaudeMessage, isUserPromptMessage } from './message'

type Transition = (event: SendLifecycleEvent) => SendLifecycleEffect | undefined

function hasUserMessageUuid(line: string, expectedUuid?: string) {
  if (!expectedUuid) return false
  try {
    const json = JSON.parse(line) as ClaudeJsonLine
    return (
      json.user_message_uuid === expectedUuid ||
      (Array.isArray(json.user_message_uuids) && json.user_message_uuids.includes(expectedUuid))
    )
  } catch {
    return false
  }
}

export function latestTurnWasInterrupted(
  messages: ClaudeMessage[],
  interruptedTurnIds: Set<string>,
) {
  let hasInterruptionMarker = false
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]
    if (message.isInterruption) {
      hasInterruptionMarker = true
      continue
    }
    if (isUserPromptMessage(message)) {
      return hasInterruptionMarker || interruptedTurnIds.has(message.id)
    }
  }
  return false
}

/** Applies live query output to history and owns the elapsed-time ticker. */
export class TurnStreamService {
  private readonly controller: SessionController
  private readonly getLifecycle: () => SendLifecycle
  private readonly transition: Transition
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    controller: SessionController,
    getLifecycle: () => SendLifecycle,
    transition: Transition,
  ) {
    this.controller = controller
    this.getLifecycle = getLifecycle
    this.transition = transition
  }

  private updateElapsed = () => {
    const startedAt = sendLifecycleStartedAt(this.getLifecycle())
    if (startedAt === null) return
    this.controller.runtimeStore.setState({
      streamingElapsed: Math.max(0, Math.floor((Date.now() - startedAt) / 1000)),
    })
  }

  private startTimer() {
    if (sendLifecycleStartedAt(this.getLifecycle()) === null || this.timer) return
    this.updateElapsed()
    this.timer = setInterval(this.updateElapsed, 200)
  }

  processLine(line: string): boolean {
    const lifecycle = this.getLifecycle()
    const pendingSend = pendingSendSnapshot(lifecycle)
    const isAwaitingHistory =
      lifecycle.phase === 'awaiting-history' || lifecycle.phase === 'recall-requested'
    // Synthetic nudges continue an interrupted turn; there is no new user line
    // to unsuppress on, so their streamed output must display right away.
    const suppressUntilRootUserHistory = Boolean(
      pendingSend &&
      !pendingSend.isSynthetic &&
      isAwaitingHistory &&
      latestTurnWasInterrupted(
        pendingSend.messages,
        this.controller.conversationStore.getState().interruptedTurnIds,
      ) &&
      !hasUserMessageUuid(line, pendingSend.userMessageUuid),
    )
    const result = this.controller.historyService.ingestLine(line, {
      shouldDeferRootUserHistory: Boolean(pendingSend),
      suppressUntilRootUserHistory,
    })

    const hasConfirmedResponse =
      !result.wasSuppressed && (result.isAgentEvent || result.isLocalCommandResult)
    if (hasConfirmedResponse && pendingSend) {
      const receivedAt = Date.now()
      const optimisticStartedAt = Date.parse(
        this.controller.historyService.optimisticTimestamp(pendingSend.optimisticMessageId) ?? '',
      )
      this.transition({
        type: 'response-confirmed',
        turnId: pendingSend.optimisticMessageId,
        startedAt: Number.isFinite(optimisticStartedAt) ? optimisticStartedAt : receivedAt,
      })
    }

    if (result.rootUserHistory && pendingSend) {
      const { message } = result.rootUserHistory
      pendingSend.userMessageUuid ??= message.uuid
      const startedAt = Date.parse(message.timestamp ?? new Date().toISOString())
      const confirmation = this.transition({
        type: 'history-confirmed',
        turnId: message.id,
        startedAt,
      })
      if (confirmation?.kind !== 'history-confirmed') return false
      this.controller.historyService.replaceOptimisticMessage(
        confirmation.optimisticMessageId,
        message,
      )
      return false
    }

    if (result.isAgentEvent || result.isLocalCommandResult) this.startTimer()
    return hasConfirmedResponse
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
