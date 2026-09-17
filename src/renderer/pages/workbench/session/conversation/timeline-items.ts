import { extractTodoItems, isTodoWriteToolName } from '../../../../services/claude/todo'
import type { ClaudeContentBlock, ClaudeMessage } from '../services/message'
import { absorbTaskTool } from './task-items'
import type { ClaudeTaskItem, ConversationTimelineItem } from './types'

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
  for (let itemIndex = timelineItems.length - 1; itemIndex >= 0; itemIndex--) {
    const item = timelineItems[itemIndex]
    if (item.kind === 'tool' && !item.result) {
      item.result = block
      if (block.isError) item.isError = true
      return
    }
  }

  timelineItems.push({
    id: `${message.id}-tool-${index}`,
    kind: 'tool',
    result: block,
    isError: block.isError || undefined,
    timestamp: message.timestamp,
  })
}

function pairTodoResult(
  timelineItems: ConversationTimelineItem[],
  block: ClaudeContentBlock,
  options: { allowFallback?: boolean } = {},
): boolean {
  if (block.toolUseId) {
    for (let itemIndex = timelineItems.length - 1; itemIndex >= 0; itemIndex--) {
      const item = timelineItems[itemIndex]
      if (
        item.kind === 'todo' &&
        item.toolUseId === block.toolUseId &&
        item.resultText === undefined
      ) {
        item.resultText = block.content
        return true
      }
    }
  }

  if (!options.allowFallback) return false

  for (let itemIndex = timelineItems.length - 1; itemIndex >= 0; itemIndex--) {
    const item = timelineItems[itemIndex]
    if (item.kind === 'todo' && item.resultText === undefined) {
      item.resultText = block.content
      return true
    }
  }

  return false
}

export type TimelineSink = { timelineItems: ConversationTimelineItem[] }
export function appendTimelineItems(sink: TimelineSink, message: ClaudeMessage) {
  if (message.taskNotification) {
    applyAgentTaskNotification(sink.timelineItems, message)
    return
  }
  const blocks = message.blocks ?? []
  const textFragments: string[] = []
  let ignoredTodoResults = 0
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
      if (isTodoWriteToolName(block.name)) {
        const todos = extractTodoItems(block.input)
        if (todos.length) {
          sink.timelineItems.push({
            id: `${message.id}-todo-${index}`,
            kind: 'todo',
            todos,
            toolUseId: block.toolUseId,
            resultText: undefined,
            timestamp: message.timestamp,
          })
        }
        ignoredTodoResults += 1
        return
      }

      sink.timelineItems.push({
        id: `${message.id}-tool-${index}`,
        kind: 'tool',
        use: block,
        timestamp: message.timestamp,
      })
      return
    }

    if (block.type === 'tool_result') {
      if (ignoredTodoResults > 0) {
        ignoredTodoResults -= 1
        pairTodoResult(sink.timelineItems, block, { allowFallback: true })
        return
      }
      if (pairTodoResult(sink.timelineItems, block)) return
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
 * - Convert TodoWrite to a dedicated todo entry during appendTimelineItems.
 * - Merge consecutive Reads into one entry (coalescedReads); even a single Read shows only the filename.
 */
export function normalizeTimelineItems(
  items: ConversationTimelineItem[],
): ConversationTimelineItem[] {
  const normalized: ConversationTimelineItem[] = []
  const tasks = new Map<string, ClaudeTaskItem>()
  let currentTaskItem: Extract<ConversationTimelineItem, { kind: 'task' }> | null = null

  for (const item of items) {
    const taskResult = absorbTaskTool(item, tasks)
    if (taskResult.isAbsorbed) {
      if (!currentTaskItem) {
        currentTaskItem = {
          id: `${item.id}-tasks`,
          kind: 'task',
          tasks: taskResult.tasks ?? [],
          timestamp: item.timestamp,
        }
        normalized.push(currentTaskItem)
      } else {
        currentTaskItem.tasks = taskResult.tasks ?? currentTaskItem.tasks
      }
      continue
    }

    normalized.push(item)
    currentTaskItem = null
  }

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
