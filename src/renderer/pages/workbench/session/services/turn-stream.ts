import type { ClaudeJsonLine } from '@/shared/rpc'

import type { SessionController } from '../session-controller'
import {
  type SendLifecycle,
  type SendLifecycleEffect,
  type SendLifecycleEvent,
  pendingSendSnapshot,
  sendLifecycleStartedAt,
} from '../stores/send-lifecycle'
import { type ClaudeMessage, claudeJsonToMessage, isUserPromptMessage } from './message'

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

/**
 * Whether a wire frame carries real turn output. The CLI never echoes the
 * pushed user line back, so suppression gates lift on the first real content
 * frame instead; synthetic cleanup frames (model `<synthetic>`) never stream
 * and stay hidden behind the gate.
 */
function carriesRealTurnContent(line: string): boolean {
  try {
    const json = JSON.parse(line) as ClaudeJsonLine
    if (json.type === 'assistant') {
      const model = (json.message as { model?: unknown } | undefined)?.model
      return model !== '<synthetic>' && Boolean(claudeJsonToMessage(json)?.blocks?.length)
    }
    if (json.type === 'result') return json.subtype === 'success' && Boolean(json.result?.trim())
    if (json.type !== 'stream_event') return false
    const event = json.event as
      | {
          type?: string
          message?: { model?: unknown }
          content_block?: { type?: string }
          delta?: { text?: string; thinking?: string; partial_json?: string }
        }
      | undefined
    if (event?.type === 'message_start') return event.message?.model !== '<synthetic>'
    if (event?.type === 'content_block_start') return Boolean(event.content_block?.type)
    if (event?.type === 'content_block_delta') {
      return Boolean(
        event.delta && (event.delta.text || event.delta.thinking || event.delta.partial_json),
      )
    }
    return false
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

/**
 * Whether a wire frame is the CLI's interruption marker user entry.
 */
function isInterruptionMarkerLine(line: string): boolean {
  try {
    return claudeJsonToMessage(JSON.parse(line) as ClaudeJsonLine)?.isInterruption === true
  } catch {
    return false
  }
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
    // A recall is already certain at this point: committing the CLI's marker
    // would only flip the pending turn to "Stopped" for the instant before
    // the recall wipes it. The kept-stop path (stop-requested) still commits.
    if (lifecycle.phase === 'recall-requested' && isInterruptionMarkerLine(line)) return false
    const pendingSend = pendingSendSnapshot(lifecycle)
    const isAwaitingHistory =
      lifecycle.phase === 'awaiting-history' || lifecycle.phase === 'recall-requested'
    // Synthetic nudges continue an interrupted turn; there is no new user line
    // to unsuppress on, so their streamed output must display right away.
    let suppressUntilRootUserHistory = false
    if (pendingSend && !pendingSend.isSynthetic && isAwaitingHistory) {
      if (carriesRealTurnContent(line)) pendingSend.realContentSeen = true
      suppressUntilRootUserHistory =
        !pendingSend.realContentSeen &&
        latestTurnWasInterrupted(
          pendingSend.messages,
          this.controller.conversationStore.getState().interruptedTurnIds,
        ) &&
        !hasUserMessageUuid(line, pendingSend.userMessageUuid)
    }
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
      // The Working-for status row is already visible before the first agent
      // frame, so the elapsed ticker must run from the history confirmation.
      this.startTimer()
      return false
    }

    // API retries produce no agent content but can stretch for minutes; keep the
    // elapsed ticker running so the status row and retry card stay live.
    if (result.isAgentEvent || result.isLocalCommandResult || result.isApiRetry) this.startTimer()
    return hasConfirmedResponse
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }
}
