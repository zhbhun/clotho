import type { ClaudeContentBlock, ClaudeMessage } from '../services/message'
import { normalizeTaskItems } from './task-items'
import type { ConversationTimelineItem } from './types'

function pushTextTimelineItem(
  timelineItems: ConversationTimelineItem[],
  message: ClaudeMessage,
  index: number,
  fragments: string[],
) {
  const text = fragments.join('\n\n').trim()
  if (!text) return

  timelineItems.push({
    id: `${message.id}-text-${index}`,
    kind: 'text',
    text,
    timestamp: message.timestamp,
  })
}

function pairToolResult(
  timelineItems: ConversationTimelineItem[],
  message: ClaudeMessage,
  index: number,
  block: ClaudeContentBlock,
) {
  // Results carry their tool_use id; matching on it keeps parallel calls in
  // one batch from crossing when several rows still await their results.
  if (block.toolUseId) {
    for (let itemIndex = timelineItems.length - 1; itemIndex >= 0; itemIndex--) {
      const item = timelineItems[itemIndex]
      if (item.kind === 'tool' && !item.result && item.use?.toolUseId === block.toolUseId) {
        item.result = block
        if (block.isError) item.isError = true
        return
      }
    }
  }

  for (let itemIndex = timelineItems.length - 1; itemIndex >= 0; itemIndex--) {
    const item = timelineItems[itemIndex]
    if (item.kind === 'tool' && !item.result) {
      item.result = block
      if (block.isError) item.isError = true
      return
    }
  }

  timelineItems.push({
    // Anchor the id on toolUseId so it survives the placeholder-to-committed
    // retirement: the same tool_use first streams inside a `stream-N`
    // placeholder message, then lands in a committed assistant frame with a
    // different message id. Message-derived ids remounted the row and dropped
    // the user's expansion state at every segment-frame boundary.
    id: block.toolUseId ? `tool-result-${block.toolUseId}` : `${message.id}-tool-${index}`,
    kind: 'tool',
    result: block,
    isError: block.isError || undefined,
    timestamp: message.timestamp,
  })
}

export type TimelineSink = { timelineItems: ConversationTimelineItem[] }
export function appendTimelineItems(sink: TimelineSink, message: ClaudeMessage) {
  if (message.taskNotification) {
    applyAgentTaskNotification(sink.timelineItems, message)
    return
  }
  const blocks = message.blocks ?? []
  const textFragments: string[] = []
  const flushText = (index: number) => {
    pushTextTimelineItem(sink.timelineItems, message, index, textFragments)
    textFragments.length = 0
  }

  blocks.forEach((block, index) => {
    if (block.type === 'text') {
      if (block.text?.trim()) {
        textFragments.push(block.text)
      }
      return
    }

    flushText(index)

    if (block.type === 'thinking') {
      sink.timelineItems.push({
        id: `${message.id}-thinking-${index}`,
        kind: 'thinking',
        text: block.text ?? '',
        timestamp: message.timestamp,
      })
      return
    }

    if (block.type === 'tool_use') {
      sink.timelineItems.push({
        // Same toolUseId anchor as the result-only fallback above: the id must
        // stay constant while the block retires from the stream placeholder
        // into its committed assistant frame.
        id: block.toolUseId ? `tool-${block.toolUseId}` : `${message.id}-tool-${index}`,
        kind: 'tool',
        use: block,
        timestamp: message.timestamp,
      })
      return
    }

    if (block.type === 'tool_result') {
      pairToolResult(sink.timelineItems, message, index, block)
    }
  })

  flushText(blocks.length)
}

const AGENT_TOOL_NAMES = new Set(['Agent', 'AgentTool', 'Task'])

export function isAgentToolName(name?: string) {
  return AGENT_TOOL_NAMES.has(name ?? '')
}

export function applyAgentTaskNotification(
  timelineItems: ConversationTimelineItem[],
  message: ClaudeMessage,
): boolean {
  const notification = message.taskNotification
  if (!notification?.toolUseId) return false

  for (let index = timelineItems.length - 1; index >= 0; index--) {
    const item = timelineItems[index]
    if (
      item.kind !== 'tool' ||
      item.use?.toolUseId !== notification.toolUseId ||
      !isAgentToolName(item.use.name)
    ) {
      continue
    }
    item.result = {
      type: 'tool_result',
      content: notification.result ?? '',
      toolUseId: notification.toolUseId,
      toolUseResult: { status: notification.status },
      isError: notification.status === 'failed',
    }
    item.isError = notification.status === 'failed' || undefined
    return true
  }
  return false
}

export function hasOnlyToolResultBlocks(message: ClaudeMessage): boolean {
  const blocks = message.blocks ?? []
  return blocks.length > 0 && blocks.every((block) => block.type === 'tool_result')
}

/** Coalesced Read entry: one file for a single Read, multiple files for consecutive Reads. */
type CoalescedRead = { file_path: string; offset?: number; limit?: number }
const READ_TOOL_NAMES = new Set(['Read', 'FileReadTool', 'ReadCoalesced'])

function readCoalesceMeta(item: ConversationTimelineItem): CoalescedRead | null {
  if (item.kind !== 'tool') return null
  if (!READ_TOOL_NAMES.has(item.use?.name ?? '')) return null
  const input = (item.use?.input ?? {}) as Record<string, unknown>
  const file_path =
    typeof input.file_path === 'string'
      ? input.file_path
      : typeof input.path === 'string'
        ? input.path
        : ''
  if (!file_path) return null
  return {
    file_path,
    offset: typeof input.offset === 'number' ? input.offset : undefined,
    limit: typeof input.limit === 'number' ? input.limit : undefined,
  }
}

/**
 * Timeline normalization:
 * - Fold TaskCreate calls into task cards (see task-items.ts for the merge rule).
 * - Merge consecutive Reads into one entry (coalescedReads); even a single Read shows only the filename.
 */
export function normalizeTimelineItems(
  items: ConversationTimelineItem[],
): ConversationTimelineItem[] {
  const normalized = normalizeTaskItems(items)

  const coalesced: ConversationTimelineItem[] = []
  for (const item of normalized) {
    const meta = readCoalesceMeta(item)
    if (meta && item.kind === 'tool' && item.result) {
      const last = coalesced[coalesced.length - 1]
      if (last?.kind === 'tool' && last.coalescedReads) {
        last.coalescedReads.push(meta)
        if (item.isError) last.isError = true
        continue
      }
      coalesced.push({
        id: item.id,
        kind: 'tool',
        use: item.use,
        isError: item.isError,
        timestamp: item.timestamp,
        coalescedReads: [meta],
      })
      continue
    }
    coalesced.push(item)
  }
  return coalesced
}
