import { type ClaudeMessage, isUserPromptMessage } from '../services/message'
import { reconcileBackgroundTasks } from './background-tasks'
import {
  type TimelineSink,
  appendTimelineItems,
  applyAgentTaskNotification,
  hasOnlyToolResultBlocks,
  isAgentToolName,
  normalizeTimelineItems,
} from './timeline-items'
import type { ConversationTimelineItem, ConversationTurn } from './types'

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function buildChildTimeline(
  parentId: string,
  messagesByParent: Map<string, ClaudeMessage[]>,
): ConversationTimelineItem[] {
  const group = messagesByParent.get(parentId) ?? []
  const sink: TimelineSink = { timelineItems: [] }
  for (const message of group) {
    appendTimelineItems(sink, message)
  }
  const items = normalizeTimelineItems(sink.timelineItems)

  for (const item of items) {
    if (item.kind !== 'tool') continue
    const toolId = item.use?.toolUseId
    if (toolId && messagesByParent.has(toolId)) {
      item.children = buildChildTimeline(toolId, messagesByParent)
    }
  }

  return items
}

export function computeSubagentTimeline(messages: ClaudeMessage[]): ConversationTimelineItem[] {
  const sink: TimelineSink = { timelineItems: [] }
  for (const message of messages) {
    if (message.isMeta || message.role === 'system') continue
    appendTimelineItems(sink, message)
  }
  return normalizeTimelineItems(sink.timelineItems)
}

function isCancelledTurnArtifact(
  message: ClaudeMessage,
  messagesByUuid: Map<string, ClaudeMessage>,
): boolean {
  // A real user message always starts a new causal boundary, even when the CLI links
  // it to a synthetic frame created while finalizing the previous cancelled request.
  if (isUserPromptMessage(message)) return false

  const visited = new Set<string>()
  let parentUuid = message.parentUuid

  while (parentUuid && !visited.has(parentUuid)) {
    visited.add(parentUuid)
    const parent = messagesByUuid.get(parentUuid)
    if (!parent) return false
    if (parent.isInterruption) return true
    if (isUserPromptMessage(parent)) return false
    parentUuid = parent.parentUuid
  }

  return false
}

export function computeTurns(messages: ClaudeMessage[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  let currentTurn: ConversationTurn | null = null
  const messagesByUuid = new Map(
    messages.flatMap((message) => (message.uuid ? [[message.uuid, message] as const] : [])),
  )
  const visibleMessages = messages.filter(
    (message) => !isCancelledTurnArtifact(message, messagesByUuid),
  )
  // Collect subagent messages by parentToolUseId; the key is the originating Task tool_use ID.
  const messagesByParent = new Map<string, ClaudeMessage[]>()

  for (const message of visibleMessages) {
    if (message.isMeta) continue
    if (message.taskNotification) {
      if (currentTurn) applyAgentTaskNotification(currentTurn.timelineItems, message)
      continue
    }
    if (message.role === 'system') continue

    // Subagent output (non-empty parentToolUseId) stays out of the main timeline and becomes children of its Task entry.
    if (message.parentToolUseId) {
      const group = messagesByParent.get(message.parentToolUseId) ?? []
      group.push(message)
      messagesByParent.set(message.parentToolUseId, group)
      continue
    }

    // A CLI interruption marker does not start a new turn; mark the current turn stopped and use its timestamp for duration.
    if (message.isInterruption) {
      if (currentTurn) {
        currentTurn.isInterrupted = true
        if (message.timestamp) currentTurn.endTimestamp = message.timestamp
      }
      continue
    }

    if (message.role === 'user' && currentTurn && hasOnlyToolResultBlocks(message)) {
      if (message.timestamp) {
        currentTurn.endTimestamp = message.timestamp
      }
      currentTurn.workBlocks.push(...(message.blocks ?? []))
      appendTimelineItems(currentTurn, message)
    } else if (message.role === 'user') {
      if (currentTurn) {
        turns.push(currentTurn)
      }
      currentTurn = {
        userMessage: message,
        assistantMessages: [],
        workBlocks: [],
        textBlocks: [],
        timelineItems: [],
        timestamp: message.timestamp,
        startTimestamp: undefined,
        endTimestamp: undefined,
      }
    } else if (currentTurn) {
      // Content appended after an interruption marker means the turn was
      // resumed (auto-continuation): it streams on, so it is no longer shown
      // as stopped at its end.
      if (currentTurn.isInterrupted) currentTurn.isInterrupted = false
      currentTurn.assistantMessages.push(message)
      if (!currentTurn.startTimestamp && message.timestamp) {
        currentTurn.startTimestamp = message.timestamp
      }
      if (message.timestamp) {
        currentTurn.endTimestamp = message.timestamp
      }
      if (message.queryError) {
        currentTurn.failure = { message: message.queryError }
        continue
      }
      if (message.blocks) {
        for (const block of message.blocks) {
          if (
            block.type === 'thinking' ||
            block.type === 'tool_use' ||
            block.type === 'tool_result'
          ) {
            currentTurn.workBlocks.push(block)
          } else if (block.type === 'text') {
            currentTurn.textBlocks.push(block)
          }
        }
      }
      appendTimelineItems(currentTurn, message)
    }
  }

  if (currentTurn) {
    turns.push(currentTurn)
  }

  for (const turn of turns) {
    turn.timelineItems = normalizeTimelineItems(turn.timelineItems)
  }

  reconcileBackgroundTasks(turns, visibleMessages)

  // Attach children to subagent tool entries in the main timeline, recursively handling nested levels.
  for (const turn of turns) {
    for (const item of turn.timelineItems) {
      if (item.kind !== 'tool') continue
      const toolId = item.use?.toolUseId
      if (toolId && messagesByParent.has(toolId)) {
        item.children = buildChildTimeline(toolId, messagesByParent)
        const itemResult = item.result
        const status = objectRecord(itemResult?.toolUseResult).status
        if (
          itemResult &&
          isAgentToolName(item.use?.name) &&
          status === 'completed' &&
          !itemResult.content?.trim()
        ) {
          const finalText = item.children.findLast((child) => child.kind === 'text')
          if (finalText?.kind === 'text') itemResult.content = finalText.text
        }
      }
    }
  }

  return turns
}

/**
 * Find the most recently sent turn during this launch in the current session
 * (the turn whose last userMessage.id belongs to sentTurnIds).
 * This determines which assistant work process is expanded by default; return null without a match.
 */
export function computeLastSentTurnId(
  turns: ConversationTurn[],
  sentTurnIds: Set<string>,
): string | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (sentTurnIds.has(turns[i].userMessage.id)) return turns[i].userMessage.id
  }
  return null
}
