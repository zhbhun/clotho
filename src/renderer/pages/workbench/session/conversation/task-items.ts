import type { ClaudeContentBlock } from '../services/message'
import type { ClaudeTaskItem, ClaudeTaskStatus, ConversationTimelineItem } from './types'

type TaskToolKind = 'create' | 'update' | 'stop'

/** A card closes for merging once every task reached a terminal state. */
const TERMINAL_TASK_STATUSES = new Set<ClaudeTaskStatus>(['completed', 'cancelled'])
const TASK_STATUSES = new Set<ClaudeTaskStatus>([
  'pending',
  'in_progress',
  'completed',
  'cancelled',
])

function taskToolKind(name?: string): TaskToolKind | null {
  const normalized = name?.replace(/Tool$/, '').toLowerCase()
  if (normalized === 'taskcreate' || normalized === 'task_create') return 'create'
  if (normalized === 'taskupdate' || normalized === 'task_update') return 'update'
  if (normalized === 'taskstop' || normalized === 'task_stop') return 'stop'
  return null
}

function taskInputObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
}

function taskInputString(input: unknown, keys: string[]): string {
  const obj = taskInputObject(input)
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

export function taskInputStatus(input: unknown): ClaudeTaskStatus | null {
  const status = taskInputString(input, ['status'])
  return TASK_STATUSES.has(status as ClaudeTaskStatus) ? (status as ClaudeTaskStatus) : null
}

function taskIdFromInput(input: unknown): string {
  return taskInputString(input, ['taskId', 'task_id', 'id'])
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function nestedString(value: unknown, keys: string[]): string {
  let current: unknown = value
  for (const key of keys) {
    current = objectRecord(current)[key]
  }
  return typeof current === 'string' || typeof current === 'number' ? String(current) : ''
}

function taskIdFromCreateToolUseResult(result?: ClaudeContentBlock): string {
  return nestedString(result?.toolUseResult, ['task', 'id'])
}

function taskSubjectFromCreateToolUseResult(result?: ClaudeContentBlock): string {
  return nestedString(result?.toolUseResult, ['task', 'subject'])
}

function taskIdFromUpdateToolUseResult(result?: ClaudeContentBlock): string {
  return nestedString(result?.toolUseResult, ['taskId'])
}

function taskStatusFromUpdateToolUseResult(result?: ClaudeContentBlock): ClaudeTaskStatus | null {
  const status = nestedString(result?.toolUseResult, ['statusChange', 'to'])
  return TASK_STATUSES.has(status as ClaudeTaskStatus) ? (status as ClaudeTaskStatus) : null
}

function taskIdFromCreateResult(result?: ClaudeContentBlock): string {
  const match = result?.content?.match(/\bTask\s+#([^\s:]+)\s+created successfully\b/i)
  return match?.[1] ?? ''
}

type TaskCardState = {
  ids: string[]
  item: Extract<ConversationTimelineItem, { kind: 'task' }>
}

/** Cloned insertion-ordered list, so later status changes never rewrite the snapshot. */
function snapshotTasks(index: Map<string, ClaudeTaskItem>): ClaudeTaskItem[] {
  return [...index.values()].map((task) => ({ ...task }))
}

/**
 * Fold TaskCreate calls into collapsible task cards. A create joins the latest
 * card while it still holds a non-terminal task; once every task completed or
 * was cancelled, the next create opens a fresh card. Cards snapshot each task
 * as created (pending); TaskUpdate and TaskStop keep their own tool rows and
 * only advance the merge state that decides where the next create lands.
 */
export function normalizeTaskItems(items: ConversationTimelineItem[]): ConversationTimelineItem[] {
  const index = new Map<string, ClaudeTaskItem>()
  const cards: TaskCardState[] = []
  const normalized: ConversationTimelineItem[] = []

  const isOpen = (card: TaskCardState) =>
    card.ids.some((id) => !TERMINAL_TASK_STATUSES.has(index.get(id)?.status as ClaudeTaskStatus))

  for (const item of items) {
    if (item.kind !== 'tool') {
      normalized.push(item)
      continue
    }
    const kind = taskToolKind(item.use?.name)
    if (!kind) {
      normalized.push(item)
      continue
    }

    if (kind === 'create') {
      const id = taskIdFromCreateToolUseResult(item.result) || taskIdFromCreateResult(item.result)
      const subject =
        taskSubjectFromCreateToolUseResult(item.result) ||
        taskInputString(item.use?.input, ['subject'])
      if (!id || !subject) {
        normalized.push(item)
        continue
      }

      const task: ClaudeTaskItem = {
        id,
        subject,
        description: taskInputString(item.use?.input, ['description']) || undefined,
        activeForm: taskInputString(item.use?.input, ['activeForm', 'active_form']) || undefined,
        status: 'pending',
      }
      index.set(id, task)

      let target = cards.at(-1)
      if (target && !isOpen(target)) target = undefined
      if (!target) {
        target = {
          ids: [],
          item: { id: `${item.id}-tasks`, kind: 'task', tasks: [], timestamp: item.timestamp },
        }
        cards.push(target)
        normalized.push(target.item)
      }
      target.ids.push(id)
      target.item.tasks.push({ ...task })
      continue
    }

    if (kind === 'update') {
      const id = taskIdFromUpdateToolUseResult(item.result) || taskIdFromInput(item.use?.input)
      const existing = id ? index.get(id) : undefined
      if (existing) {
        const status =
          taskStatusFromUpdateToolUseResult(item.result) || taskInputStatus(item.use?.input)
        if (status) existing.status = status
        item.taskItems = snapshotTasks(index)
      }
      normalized.push(item)
      continue
    }

    const id = taskIdFromUpdateToolUseResult(item.result) || taskIdFromInput(item.use?.input)
    const existing = id ? index.get(id) : undefined
    if (existing) {
      existing.status = 'cancelled'
      item.taskItems = snapshotTasks(index)
    }
    normalized.push(item)
  }

  return normalized
}
