import type { TFunction } from 'i18next'
import { ListCheck, ListEnd, ListStart, type LucideIcon } from 'lucide-react'

import { taskInputStatus } from '../conversation/task-items'
import type { ClaudeTaskItem } from '../conversation/types'
import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'
import { TaskSummary } from './task-summary'

const STATUS_LABEL_KEYS = {
  cancelled: 'tools.task.status.cancelled',
  completed: 'tools.task.status.completed',
  in_progress: 'tools.task.status.inProgress',
  pending: 'tools.task.status.pending',
} as const

function statusLabel(status: ClaudeTaskItem['status'], t?: TFunction): string {
  return t?.(STATUS_LABEL_KEYS[status]) ?? status
}

/** Resolve the task this update touched: id from input, status from result or input. */
function updatedTask(input: unknown, toolUseResult: unknown): ClaudeTaskItem | null {
  const id = pickString(input, ['taskId', 'task_id', 'id'])
  if (!id) return null
  const result =
    toolUseResult && typeof toolUseResult === 'object'
      ? (toolUseResult as Record<string, unknown>)
      : {}
  const change = result.statusChange
  const fromChange =
    change && typeof change === 'object' ? (change as { to?: unknown }).to : undefined
  const status =
    typeof fromChange === 'string' && fromChange in STATUS_LABEL_KEYS
      ? (fromChange as ClaudeTaskItem['status'])
      : taskInputStatus(input)
  if (!status) return null

  return {
    id,
    subject: pickString(input, ['subject']) || `#${id}`,
    status,
  }
}

/** ListStart while a task runs, ListCheck once done, ListEnd for the rest. */
function updateIcon(input: unknown, toolUseResult?: unknown): LucideIcon {
  const status = updatedTask(input, toolUseResult)?.status
  if (status === 'in_progress') return ListStart
  if (status === 'completed') return ListCheck
  return ListEnd
}

export const taskUpdateRenderer: ToolRenderer = {
  icon: ListEnd,
  iconFor: updateIcon,
  label: 'tools.TaskUpdate.label',
  description: 'tools.taskUpdate.description',
  summary: (input, _result, toolUseResult, t) => {
    const task = updatedTask(input, toolUseResult)
    if (!task) return pickString(input, ['subject', 'taskId', 'task_id', 'id'])
    return `${task.subject} → ${statusLabel(task.status, t)}`
  },
  inputView: () => null,
  hasBody: (input, _result, _images, toolUseResult) => Boolean(updatedTask(input, toolUseResult)),
  bodyItemView: ({ input, taskItems, toolUseResult }) => {
    const task = updatedTask(input, toolUseResult)
    if (!task) return null
    // Prefer the full tracked list at this point; fall back to the single task.
    return <TaskSummary flat tasks={taskItems?.length ? taskItems : [task]} />
  },
}
