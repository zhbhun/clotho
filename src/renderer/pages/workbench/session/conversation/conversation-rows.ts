import type { TFunction } from 'i18next'

import type { ClaudeToolRequest } from '../../../../services/claude/claude'
import type { ClaudeMessage } from '../services/message'
import type { TurnFileChange } from './file-changes'
import { summarizeTurnFileChanges } from './file-changes'
import { type TurnTerminalStatus, isTimelineToolRunning } from './tool-state'
import type { ConversationTimelineItem, ConversationTurn } from './types'
import { groupWorkRuns } from './work-runs'

export type ConversationRow =
  | {
      /** The model-switch divider sits directly above; its built-in inter-turn gap is supplied there. */
      afterDivider?: boolean
      key: string
      kind: 'user'
      message: ClaudeMessage
      turnId?: string
    }
  | {
      canToggle: boolean
      duration?: string
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
      compactAfter: boolean
      isActive: boolean
      isExpanded: boolean
      isLast: boolean
      isStreaming: boolean
      items: ConversationTimelineItem[]
      key: string
      kind: 'work-run'
      runId: string
      turnId?: string
      turnTerminalStatus?: TurnTerminalStatus
    }
  | {
      isStreaming: boolean
      item: Extract<ConversationTimelineItem, { kind: 'text' }>
      key: string
      kind: 'text'
      turnId: string
    }
  | {
      isLast: boolean
      isStreaming: boolean
      item: Extract<ConversationTimelineItem, { kind: 'api-retry' }>
      key: string
      kind: 'api-retry'
      turnId: string
      turnTerminalStatus?: TurnTerminalStatus
    }
  | {
      isLast: boolean
      isStreaming: boolean
      item: Extract<ConversationTimelineItem, { kind: 'compaction' }>
      key: string
      kind: 'compaction'
      turnId: string
      turnTerminalStatus?: TurnTerminalStatus
    }
  | {
      /** Terminal turn failure, rendered as a standalone error card under the status row. */
      key: string
      kind: 'error-card'
      message: string
      turnId: string
    }
  | {
      /** The assistant model changed for this turn; rendered as a divider above the prompt. */
      fromModel: string
      key: string
      kind: 'model-switch'
      timestamp?: string
      toModel: string
      turnId: string
    }
  | {
      /** Turn-end summary card listing the files the turn's edits touched. */
      files: TurnFileChange[]
      key: string
      kind: 'file-changes'
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

function isToolDisplayHeld(
  item: ConversationTimelineItem,
  heldToolUseIds: ReadonlySet<string> | undefined,
) {
  return Boolean(
    item.kind === 'tool' && item.use?.toolUseId && heldToolUseIds?.has(item.use.toolUseId),
  )
}

export function buildConversationRows(options: {
  expandedRuns?: Record<string, boolean>
  expandedTurns: Record<string, boolean>
  /** Tools inside their display-hold window; they keep the tail instead of Thinking. */
  heldToolUseIds?: ReadonlySet<string>
  interruptedTurnDurations?: Record<string, number>
  interruptedTurnIds: Set<string>
  isStreaming: boolean
  lastSentTurnId: string | null
  pendingRequests?: Record<string, ClaudeToolRequest>
  streamingElapsed: number
  streamTextStalled?: boolean
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
    // The persisted assistant error frame (e.g. the 429 quota message) is more
    // meaningful than the process-exit text carried by the runtime failure.
    const failureMessage = turn.failure?.message ?? runtimeFailure?.message
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
    // A turn that only carries a compaction divider (an explicit /compact prompt)
    // needs no Worked-for header — the divider is the turn's whole story.
    // Interrupted or failed compactions keep their terminal status row.
    const isCompactionOnlyTurn =
      !isInterrupted &&
      !hasFailure &&
      timelineItems.length > 0 &&
      timelineItems.every((item) => item.kind === 'compaction')
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

    if (turn.modelSwitch) {
      rows.push({
        fromModel: turn.modelSwitch.fromModel,
        key: `turn:${turnId}:model-switch`,
        kind: 'model-switch',
        timestamp: turn.modelSwitch.timestamp,
        toModel: turn.modelSwitch.toModel,
        turnId,
      })
    }

    rows.push({
      key: `turn:${turnId}:user`,
      kind: 'user',
      message: turn.userMessage,
      turnId,
      ...(turn.modelSwitch ? { afterDivider: true } : {}),
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
        let trailingStartIndex = hasWorkAfterLastText ? lastTextIndex : timelineItems.length
        // A compaction divider survives collapse: never fold the visible window
        // past the first one.
        const firstCompactionIndex = timelineItems.findIndex((item) => item.kind === 'compaction')
        if (firstCompactionIndex >= 0) {
          trailingStartIndex = Math.min(trailingStartIndex, firstCompactionIndex)
        }
        const visibleItems = isExpanded ? timelineItems : timelineItems.slice(trailingStartIndex)
        const slices = groupWorkRuns(visibleItems, `turn:${turnId}`, (item) =>
          Boolean(toolRequestFor(options.pendingRequests, item) === undefined),
        )
        const lastSlice = slices.at(-1)
        const lastVisibleItem = visibleItems.at(-1)
        const lastItemInCollapsedRun =
          lastSlice?.kind === 'run' && !options.expandedRuns?.[lastSlice.runId]
        const collapsedSummary =
          !isExpanded && !hasWorkAfterLastText
            ? textItems.findLast((item) => Boolean(item.text.trim()))
            : undefined
        const isSettledTool = Boolean(
          lastVisibleItem &&
          lastVisibleItem.kind === 'tool' &&
          !toolRequestFor(options.pendingRequests, lastVisibleItem) &&
          !isTimelineToolRunning(lastVisibleItem, {
            isStreaming,
            pendingRequest: toolRequestFor(options.pendingRequests, lastVisibleItem),
            turnTerminalStatus,
          }) &&
          // A tool inside its display-hold window still owns the tail (see
          // useToolDisplayHold): handing over to Thinking here would flash.
          !isToolDisplayHeld(lastVisibleItem, options.heldToolUseIds),
        )
        // A stream-placeholder text item (`stream-N` id) is still typing, so it
        // hides the placeholder — unless it has gone quiet past the stall
        // threshold, which means the model has moved on to its next step.
        const isIdleTextTail = Boolean(
          lastVisibleItem?.kind === 'text' &&
          (!lastVisibleItem.id.startsWith('stream-') || options.streamTextStalled),
        )
        // While streaming, a settled tail — finished tool, idle text
        // segment, or the collapsed summary text — means the model is between
        // steps; keep the Thinking placeholder visible through that wait.
        const showTrailingThinking = Boolean(
          isStreaming &&
          !turnTerminalStatus &&
          (isExpanded || hasWorkAfterLastText
            ? (isSettledTool && !lastItemInCollapsedRun) || isIdleTextTail
            : Boolean(collapsedSummary)),
        )
        // After a finished tool the Thinking placeholder takes the tool's own
        // row (like a collapsed run header) instead of stacking a second
        // shimmering line under the settled row.
        const thinkingReplacesTailTool = showTrailingThinking && isSettledTool

        // Every status — including a terminal failure — heads the turn under
        // the prompt as its expandable header; the failure's error card still
        // closes the turn below.
        if (!isCompactionOnlyTurn) {
          rows.push({
            canToggle: true,
            duration,
            isExpanded,
            isLast: visibleItems.length === 0 && !showTrailingThinking && !collapsedSummary,
            key: `turn:${turnId}:status`,
            kind: 'status',
            status,
            turnId,
          })
        }

        slices.forEach((slice, sliceIndex) => {
          const nextSlice = slices[sliceIndex + 1]
          const isLastSlice = sliceIndex === slices.length - 1
          const nextIsWork = nextSlice
            ? nextSlice.kind === 'run' || nextSlice.item.kind !== 'text'
            : showTrailingThinking

          if (slice.kind === 'run') {
            rows.push({
              compactAfter: nextIsWork,
              isActive: isStreaming && isLastSlice,
              isExpanded: Boolean(options.expandedRuns?.[slice.runId]),
              isLast: isLastSlice && !showTrailingThinking && !hasFailure,
              isStreaming,
              items: slice.items,
              key: slice.runId,
              kind: 'work-run',
              runId: slice.runId,
              turnId,
              turnTerminalStatus,
            })
            return
          }

          const item = slice.item
          if (item.kind === 'api-retry') {
            rows.push({
              isLast: isLastSlice && !showTrailingThinking && !hasFailure,
              isStreaming,
              item,
              key: `turn:${turnId}:api-retry:${item.id}`,
              kind: 'api-retry',
              turnId,
              turnTerminalStatus,
            })
            return
          }
          if (item.kind === 'compaction') {
            rows.push({
              isLast: isLastSlice && !showTrailingThinking && !hasFailure,
              isStreaming,
              item,
              key: `turn:${turnId}:compaction:${item.id}`,
              kind: 'compaction',
              turnId,
              turnTerminalStatus,
            })
            return
          }
          if (thinkingReplacesTailTool && isLastSlice) return
          rows.push({
            compactAfter: item.kind !== 'text' && nextIsWork,
            isLast: isLastSlice && !showTrailingThinking && !hasFailure,
            isStreaming,
            item,
            key: `turn:${turnId}:timeline:${item.id}`,
            kind: 'timeline',
            turnTerminalStatus,
            turnId,
          })
        })

        if (collapsedSummary) {
          rows.push({
            compactAfter: false,
            isLast: !showTrailingThinking && !hasFailure,
            isStreaming,
            item: collapsedSummary,
            key: `turn:${turnId}:summary:${collapsedSummary.id}`,
            kind: 'timeline',
            turnTerminalStatus,
            turnId,
          })
        }

        if (showTrailingThinking) {
          rows.push({
            key: `turn:${turnId}:thinking`,
            kind: 'thinking',
            placement: 'timeline',
            turnId,
          })
        }
      } else {
        if (!isCompactionOnlyTurn) {
          rows.push({
            canToggle: false,
            duration,
            isExpanded: false,
            isLast: textItems.length === 0,
            key: `turn:${turnId}:status`,
            kind: 'status',
            status,
            turnId,
          })
        }

        textItems.forEach((item) => {
          rows.push({
            isStreaming,
            item,
            key: `turn:${turnId}:text:${item.id}`,
            kind: 'text',
            turnId,
          })
        })

        // Text-only turn still streaming after its text went quiet: the model
        // is producing its next segment (e.g. provider-buffered reasoning).
        // A `stream-N` item counts once it stalls past the threshold.
        const lastTextItem = textItems.at(-1)
        if (
          isStreaming &&
          !turnTerminalStatus &&
          lastTextItem &&
          (!lastTextItem.id.startsWith('stream-') || options.streamTextStalled)
        ) {
          rows.push({
            key: `turn:${turnId}:thinking`,
            kind: 'thinking',
            placement: 'timeline',
            turnId,
          })
        }
      }

      // Turn-end record of edited files: only once the turn settles, so the
      // card reflects the turn's final set of changes.
      const fileChanges = isStreaming ? [] : summarizeTurnFileChanges(turn.timelineItems)
      if (fileChanges.length > 0) {
        rows.push({
          files: fileChanges,
          key: `turn:${turnId}:file-changes`,
          kind: 'file-changes',
          turnId,
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

      if (hasFailure && failureMessage) {
        rows.push({
          key: `turn:${turnId}:error-card`,
          kind: 'error-card',
          message: failureMessage,
          turnId,
        })
      }
    }

    // A stop/failure marker can arrive before the streaming flag is cleared. Do not render
    // the transient Thinking placeholder alongside a terminal status during that handoff.
    if (isStreaming && !turnTerminalStatus && !turn.timelineItems.length) {
      // First agent frame still pending: the Working-for timer runs from the
      // send moment while the Thinking placeholder holds the turn's tail.
      rows.push({
        canToggle: false,
        duration: durationLabel(
          turn,
          isStreaming,
          options.formatDuration ?? formatConversationDuration,
        ),
        isExpanded: false,
        isLast: false,
        key: `turn:${turnId}:status`,
        kind: 'status',
        status: 'processing',
        turnId,
      })
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
  expandedRuns?: Record<string, boolean>
  initialUserMessage?: ClaudeMessage
  isStreaming?: boolean
  items: ConversationTimelineItem[]
}): ConversationRow[] {
  const rows: ConversationRow[] = []
  const isStreaming = Boolean(options.isStreaming)

  if (options.initialUserMessage) {
    rows.push({
      key: `subagent:user:${options.initialUserMessage.id}`,
      kind: 'user',
      message: options.initialUserMessage,
    })
  }

  const slices = groupWorkRuns(options.items, 'subagent')
  slices.forEach((slice, sliceIndex) => {
    const nextSlice = slices[sliceIndex + 1]
    const isLastSlice = sliceIndex === slices.length - 1
    const nextIsWork = nextSlice
      ? nextSlice.kind === 'run' || nextSlice.item.kind !== 'text'
      : false

    if (slice.kind === 'run') {
      rows.push({
        compactAfter: nextIsWork,
        isActive: isStreaming && isLastSlice,
        isExpanded: Boolean(options.expandedRuns?.[slice.runId]),
        isLast: isLastSlice,
        isStreaming,
        items: slice.items,
        key: slice.runId,
        kind: 'work-run',
        runId: slice.runId,
      })
      return
    }

    const item = slice.item
    rows.push({
      compactAfter: Boolean(item.kind !== 'text' && nextIsWork),
      isLast: isLastSlice,
      isStreaming,
      item,
      key: `subagent:timeline:${item.id}`,
      kind: 'timeline',
    })
  })

  return rows
}
