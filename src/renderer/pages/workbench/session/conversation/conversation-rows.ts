import type { TFunction } from 'i18next'

import type { ClaudeToolRequest } from '../../../../services/claude/claude'
import type { ClaudeMessage } from '../services/message'
import { type TurnTerminalStatus, isTimelineToolRunning } from './tool-state'
import type { ConversationTimelineItem, ConversationTurn } from './types'

export type ConversationRow =
  | {
      key: string
      kind: 'user'
      message: ClaudeMessage
      turnId?: string
    }
  | {
      canToggle: boolean
      duration?: string
      error?: string
      isExpanded: boolean
      isLast: boolean
      key: string
      kind: 'status'
      status: 'processing' | 'completed' | 'interrupted' | 'failed'
      turnId: string
    }
  | {
      compactAfter: boolean
      isLast: boolean
      isStreaming: boolean
      item: ConversationTimelineItem
      key: string
      kind: 'timeline'
      turnTerminalStatus?: TurnTerminalStatus
      turnId?: string
    }
  | {
      isStreaming: boolean
      item: Extract<ConversationTimelineItem, { kind: 'text' }>
      key: string
      kind: 'text'
      turnId: string
    }
  | {
      hasTopGap: boolean
      messageUuid?: string
      key: string
      kind: 'actions'
      text: string
      timestamp?: string
      turnId: string
    }
  | {
      key: string
      kind: 'thinking'
      placement: 'standalone' | 'timeline'
      turnId: string
    }

function durationLabel(
  turn: ConversationTurn,
  isStreaming: boolean,
  formatter: (seconds: number) => string,
) {
  const startTimestamp = turn.userMessage.timestamp ?? turn.startTimestamp
  if (!startTimestamp) return undefined
  const start = new Date(startTimestamp).getTime()
  const end = isStreaming
    ? Date.now()
    : turn.endTimestamp
      ? new Date(turn.endTimestamp).getTime()
      : NaN
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined
  return formatter(Math.floor((end - start) / 1000))
}

const DEFAULT_DURATION_TRANSLATOR = ((key: string, values: Record<string, number>) => {
  if (key === 'workbench.duration.seconds') return `${values.seconds}s`
  if (key === 'workbench.duration.minutes') return `${values.minutes}m`
  return `${values.minutes}m ${values.seconds}s`
}) as unknown as TFunction

export function formatConversationDuration(
  seconds: number,
  t: TFunction = DEFAULT_DURATION_TRANSLATOR,
) {
  if (seconds < 60) return t('workbench.duration.seconds', { seconds })
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder > 0
    ? t('workbench.duration.minutesSeconds', { minutes, seconds: remainder })
    : t('workbench.duration.minutes', { minutes })
}

function toolRequestFor(
  pendingRequests: Record<string, ClaudeToolRequest> | undefined,
  item: ConversationTimelineItem,
) {
  return item.kind === 'tool' && item.use?.toolUseId
    ? pendingRequests?.[item.use.toolUseId]
    : undefined
}

export function buildConversationRows(options: {
  expandedTurns: Record<string, boolean>
  interruptedTurnDurations?: Record<string, number>
  interruptedTurnIds: Set<string>
  isStreaming: boolean
  lastSentTurnId: string | null
  pendingRequests?: Record<string, ClaudeToolRequest>
  streamingElapsed: number
  turnFailures?: Record<string, { elapsed: number; message: string }>
  turns: ConversationTurn[]
  formatDuration?: (seconds: number) => string
}): ConversationRow[] {
  const rows: ConversationRow[] = []

  options.turns.forEach((turn, turnIndex) => {
    const turnId = turn.userMessage.id
    const isLast = turnIndex === options.turns.length - 1
    const isStreaming = isLast && options.isStreaming
    const isInterrupted =
      turn.isInterrupted === true || options.interruptedTurnIds.has(turn.userMessage.id)
    const runtimeFailure = options.turnFailures?.[turnId]
    const failureMessage = runtimeFailure?.message ?? turn.failure?.message
    const hasFailure = Boolean(failureMessage)
    const turnTerminalStatus: TurnTerminalStatus | undefined = hasFailure
      ? 'failed'
      : isInterrupted
        ? 'interrupted'
        : undefined
    const isExpanded =
      options.expandedTurns[turnId] ?? turn.userMessage.id === options.lastSentTurnId
    const timelineItems = turn.timelineItems.filter(
      (item) => toolRequestFor(options.pendingRequests, item)?.kind !== 'ask',
    )
    const hasStructuredTimeline = timelineItems.some((item) => item.kind !== 'text')
    const usesStatus = timelineItems.length > 0 || isInterrupted || hasFailure
    const textItems = timelineItems.filter(
      (item): item is Extract<ConversationTimelineItem, { kind: 'text' }> => item.kind === 'text',
    )
    const finalTextMessage = turn.assistantMessages.findLast((message) =>
      Boolean(
        message.role === 'assistant' &&
        (!message.type || message.type === 'assistant') &&
        message.blocks?.some((block) => block.type === 'text' && block.text?.trim()),
      ),
    )
    const finalTextItem = finalTextMessage
      ? textItems.findLast((item) => item.id.startsWith(`${finalTextMessage.id}-text-`))
      : undefined

    rows.push({
      key: `turn:${turnId}:user`,
      kind: 'user',
      message: turn.userMessage,
      turnId,
    })

    if (usesStatus) {
      const status = turnTerminalStatus ?? (isStreaming ? 'processing' : 'completed')
      const capturedElapsed = runtimeFailure?.elapsed ?? options.interruptedTurnDurations?.[turnId]
      const duration =
        capturedElapsed === undefined
          ? durationLabel(turn, isStreaming, options.formatDuration ?? formatConversationDuration)
          : (options.formatDuration ?? formatConversationDuration)(capturedElapsed)

      if (hasStructuredTimeline) {
        const lastTextIndex = timelineItems.findLastIndex((item) => item.kind === 'text')
        const hasWorkAfterLastText =
          lastTextIndex >= 0 &&
          timelineItems.slice(lastTextIndex + 1).some((item) => item.kind !== 'text')
        const trailingStartIndex = hasWorkAfterLastText ? lastTextIndex : timelineItems.length
        const visibleItems = isExpanded ? timelineItems : timelineItems.slice(trailingStartIndex)
        const latestItem = timelineItems.at(-1)
        const latestPendingRequest = latestItem
          ? toolRequestFor(options.pendingRequests, latestItem)
          : undefined
        const showThinkingAfterLatestTool = Boolean(
          (isExpanded || hasWorkAfterLastText) &&
          isStreaming &&
          latestItem?.kind === 'tool' &&
          !latestPendingRequest &&
          !isTimelineToolRunning(latestItem, {
            isStreaming,
            pendingRequest: latestPendingRequest,
            turnTerminalStatus,
          }),
        )
        const collapsedSummary =
          !isExpanded && !hasWorkAfterLastText
            ? textItems.findLast((item) => Boolean(item.text.trim()))
            : undefined

        rows.push({
          canToggle: true,
          duration,
          error: failureMessage,
          isExpanded,
          isLast: visibleItems.length === 0 && !showThinkingAfterLatestTool && !collapsedSummary,
          key: `turn:${turnId}:status`,
          kind: 'status',
          status,
          turnId,
        })

        visibleItems.forEach((item, itemIndex) => {
          const nextItem = visibleItems[itemIndex + 1]
          rows.push({
            compactAfter:
              item.kind !== 'text' &&
              (nextItem ? nextItem.kind !== 'text' : showThinkingAfterLatestTool),
            isLast: itemIndex === visibleItems.length - 1 && !showThinkingAfterLatestTool,
            isStreaming,
            item,
            key: `turn:${turnId}:timeline:${item.id}`,
            kind: 'timeline',
            turnTerminalStatus,
            turnId,
          })
        })

        if (showThinkingAfterLatestTool) {
          rows.push({
            key: `turn:${turnId}:thinking`,
            kind: 'thinking',
            placement: 'timeline',
            turnId,
          })
        }

        if (collapsedSummary) {
          rows.push({
            compactAfter: false,
            isLast: true,
            isStreaming,
            item: collapsedSummary,
            key: `turn:${turnId}:summary:${collapsedSummary.id}`,
            kind: 'timeline',
            turnTerminalStatus,
            turnId,
          })
        }
      } else {
        rows.push({
          canToggle: false,
          duration,
          error: failureMessage,
          isExpanded: false,
          isLast: textItems.length === 0,
          key: `turn:${turnId}:status`,
          kind: 'status',
          status,
          turnId,
        })

        textItems.forEach((item) => {
          rows.push({
            isStreaming,
            item,
            key: `turn:${turnId}:text:${item.id}`,
            kind: 'text',
            turnId,
          })
        })
      }

      if (!isStreaming && finalTextItem) {
        rows.push({
          hasTopGap: true,
          key: `turn:${turnId}:actions:${finalTextItem.id}`,
          kind: 'actions',
          messageUuid: finalTextMessage?.uuid,
          text: finalTextItem.text,
          timestamp: finalTextItem.timestamp,
          turnId,
        })
      }
    }

    // A stop/failure marker can arrive before the streaming flag is cleared. Do not render
    // the transient Thinking placeholder alongside a terminal status during that handoff.
    if (isStreaming && !turnTerminalStatus && !turn.timelineItems.length) {
      rows.push({
        key: `turn:${turnId}:thinking`,
        kind: 'thinking',
        placement: 'standalone',
        turnId,
      })
    }
  })

  return rows
}

export function buildSubagentConversationRows(options: {
  initialUserMessage?: ClaudeMessage
  items: ConversationTimelineItem[]
}): ConversationRow[] {
  const rows: ConversationRow[] = []

  if (options.initialUserMessage) {
    rows.push({
      key: `subagent:user:${options.initialUserMessage.id}`,
      kind: 'user',
      message: options.initialUserMessage,
    })
  }

  options.items.forEach((item, index) => {
    const nextItem = options.items[index + 1]
    rows.push({
      compactAfter: Boolean(item.kind !== 'text' && nextItem && nextItem.kind !== 'text'),
      isLast: index === options.items.length - 1,
      isStreaming: false,
      item,
      key: `subagent:timeline:${item.id}`,
      kind: 'timeline',
    })
  })

  return rows
}
