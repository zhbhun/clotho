import type { ClaudeContentBlock } from '../services/message'
import type { ClaudeTaskItem, ClaudeTaskStatus, ConversationTimelineItem } from './types'

type TaskToolKind = 'create' | 'update'

function taskToolKind(name?: string): TaskToolKind | null {
  const normalized = name?.replace(/Tool$/, '').toLowerCase()
  if (normalized === 'taskcreate' || normalized === 'task_create') return 'create'
  if (normalized === 'taskupdate' || normalized === 'task_update') return 'update'
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

function taskInputStatus(input: unknown): ClaudeTaskStatus | null {
  const status = taskInputString(input, ['status'])
  if (status === 'pending' || status === 'in_progress' || status === 'completed') return status
  return null
}

function taskIdFromInput(input: unknown): string {
  return taskInputString(input, ['taskId', 'task_id', 'id'])
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
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
  if (status === 'pending' || status === 'in_progress' || status === 'completed') return status
  return null
}

function taskIdFromCreateResult(result?: ClaudeContentBlock): string {
  const match = result?.content?.match(/\bTask\s+#([^\s:]+)\s+created successfully\b/i)
  return match?.[1] ?? ''
}

function cloneTaskItems(tasks: Map<string, ClaudeTaskItem>): ClaudeTaskItem[] {
  return Array.from(tasks.values()).map((task) => ({ ...task }))
}

export function absorbTaskTool(
  item: ConversationTimelineItem,
  tasks: Map<string, ClaudeTaskItem>,
): { isAbsorbed: boolean; tasks?: ClaudeTaskItem[] } {
  if (item.kind !== 'tool') return { isAbsorbed: false }
  const kind = taskToolKind(item.use?.name)
  if (!kind) return { isAbsorbed: false }

  if (kind === 'create') {
    const id = taskIdFromCreateToolUseResult(item.result) || taskIdFromCreateResult(item.result)
    const subject =
      taskSubjectFromCreateToolUseResult(item.result) ||
      taskInputString(item.use?.input, ['subject'])
    if (!id || !subject) return { isAbsorbed: false }

    tasks.set(id, {
      id,
      subject,
      description: taskInputString(item.use?.input, ['description']) || undefined,
      activeForm: taskInputString(item.use?.input, ['activeForm', 'active_form']) || undefined,
      status: 'pending',
    })
    return { isAbsorbed: true, tasks: cloneTaskItems(tasks) }
  }

  const id = taskIdFromUpdateToolUseResult(item.result) || taskIdFromInput(item.use?.input)
  const existing = id ? tasks.get(id) : undefined
  if (!existing) return { isAbsorbed: false }

  if (kind === 'update') {
    const status =
      taskStatusFromUpdateToolUseResult(item.result) || taskInputStatus(item.use?.input)
    if (status) existing.status = status
    const activeForm = taskInputString(item.use?.input, ['activeForm', 'active_form'])
    if (activeForm) existing.activeForm = activeForm
  }

  return { isAbsorbed: true, tasks: cloneTaskItems(tasks) }
}
