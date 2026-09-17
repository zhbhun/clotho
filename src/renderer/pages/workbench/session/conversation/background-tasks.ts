import { xmlTextField } from '../services/message'
import type { ClaudeContentBlock, ClaudeMessage } from '../services/message'
import type {
  ClaudeBackgroundTask,
  ClaudeBackgroundTaskStatus,
  ConversationTimelineItem,
  ConversationTurn,
} from './types'

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

type TimelineToolItem = Extract<ConversationTimelineItem, { kind: 'tool' }>

const BACKGROUND_COMMAND_TOOL_NAMES = new Set(['Bash', 'BashTool', 'PowerShell', 'PowerShellTool'])
const BACKGROUND_TASK_TOOL_NAMES = new Set([
  ...BACKGROUND_COMMAND_TOOL_NAMES,
  'Monitor',
  'MonitorTool',
])
const TASK_OUTPUT_TOOL_NAMES = new Set(['TaskOutput', 'TaskOutputTool'])
const TASK_STOP_TOOL_NAMES = new Set(['TaskStop', 'TaskStopTool'])

function recordString(source: unknown, keys: string[]): string {
  const value = objectRecord(source)
  for (const key of keys) {
    const field = value[key]
    if (typeof field === 'string' && field.trim()) return field.trim()
    if (typeof field === 'number' && Number.isFinite(field)) return String(field)
  }
  return ''
}

function recordNumber(source: unknown, keys: string[]): number | undefined {
  const value = objectRecord(source)
  for (const key of keys) {
    const field = value[key]
    if (typeof field === 'number' && Number.isFinite(field)) return field
  }
  return undefined
}

function backgroundTaskIdFromText(content?: string): string {
  if (!content) return ''
  const patterns = [
    /\bbackground with ID:\s*([^\s.]+)/i,
    /\bbackground\s*\(ID:\s*([^\s)]+)/i,
    /\bMonitor started\s*\(task\s+([^,\s)]+)/i,
  ]
  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match?.[1]) return match[1]
  }
  return ''
}

function backgroundTaskIdFromResult(result?: ClaudeContentBlock): string {
  const structured = objectRecord(result?.toolUseResult)
  return (
    recordString(structured, ['backgroundTaskId', 'taskId', 'task_id']) ||
    recordString(structured.task, ['taskId', 'task_id', 'id']) ||
    backgroundTaskIdFromText(result?.content)
  )
}

function backgroundStatus(value: unknown): ClaudeBackgroundTaskStatus | undefined {
  if (value === 'running' || value === 'in_progress' || value === 'pending') return 'running'
  if (value === 'completed' || value === 'success') return 'completed'
  if (value === 'failed' || value === 'error') return 'failed'
  if (value === 'stopped' || value === 'cancelled' || value === 'aborted' || value === 'killed') {
    return 'stopped'
  }
  return undefined
}

function exitCodeFromSummary(summary?: string): number | undefined {
  const match = summary?.match(/\bexit code\s+(-?\d+)\b/i)
  return match ? Number(match[1]) : undefined
}

function updateBackgroundTask(
  item: TimelineToolItem,
  update: Partial<ClaudeBackgroundTask> & Pick<ClaudeBackgroundTask, 'taskId' | 'status'>,
) {
  const exitCode =
    update.exitCode ??
    item.backgroundTask?.exitCode ??
    (update.status === 'completed' && BACKGROUND_COMMAND_TOOL_NAMES.has(item.use?.name ?? '')
      ? 0
      : undefined)
  item.backgroundTask = {
    ...item.backgroundTask,
    ...update,
    output: update.output ?? item.backgroundTask?.output,
    summary: update.summary ?? item.backgroundTask?.summary,
    exitCode,
  }
  item.isError = update.status === 'failed' || undefined
}

function taskOutputUpdate(
  item: TimelineToolItem,
  result: ClaudeContentBlock,
): ClaudeBackgroundTask | null {
  const structured = objectRecord(result.toolUseResult)
  const task = objectRecord(structured.task)
  const taskId =
    recordString(task, ['taskId', 'task_id', 'id']) ||
    recordString(structured, ['taskId', 'task_id', 'id']) ||
    recordString(item.use?.input, ['taskId', 'task_id', 'id']) ||
    xmlTextField(result.content ?? '', 'task_id') ||
    xmlTextField(result.content ?? '', 'task-id')
  const status =
    backgroundStatus(task.status) ??
    backgroundStatus(structured.status) ??
    backgroundStatus(xmlTextField(result.content ?? '', 'status'))
  if (!taskId || !status) return null

  const output =
    recordString(task, ['output', 'stdout', 'stderr']) ||
    recordString(structured, ['output', 'stdout', 'stderr']) ||
    xmlTextField(result.content ?? '', 'output') ||
    (result.content?.trim().startsWith('<') ? '' : (result.content ?? ''))
  return {
    taskId,
    status,
    output: output || undefined,
    exitCode:
      recordNumber(task, ['exitCode', 'exit_code']) ??
      recordNumber(structured, ['exitCode', 'exit_code']),
  }
}

/**
 * Reconcile long-running command state independently of the turn that launched it.
 * Task notifications, TaskOutput, and TaskStop can all arrive after the parent turn has ended.
 */
export function reconcileBackgroundTasks(turns: ConversationTurn[], messages: ClaudeMessage[]) {
  const toolsByUseId = new Map<string, TimelineToolItem>()
  const tasksById = new Map<string, TimelineToolItem>()

  for (const turn of turns) {
    for (const item of turn.timelineItems) {
      if (item.kind === 'tool' && item.use?.toolUseId) {
        toolsByUseId.set(item.use.toolUseId, item)
      }
    }
  }

  for (const message of messages) {
    if (message.parentToolUseId) continue
    const notification = message.taskNotification
    if (notification) {
      const target =
        (notification.toolUseId ? toolsByUseId.get(notification.toolUseId) : undefined) ??
        (notification.taskId ? tasksById.get(notification.taskId) : undefined)
      if (target && BACKGROUND_TASK_TOOL_NAMES.has(target.use?.name ?? '')) {
        const taskId = notification.taskId || target.backgroundTask?.taskId
        if (taskId) {
          updateBackgroundTask(target, {
            taskId,
            status: notification.status,
            output: notification.result,
            summary: notification.summary,
            exitCode: exitCodeFromSummary(notification.summary),
          })
          tasksById.set(taskId, target)
        }
      }
      continue
    }

    for (const block of message.blocks ?? []) {
      if (block.type !== 'tool_result' || !block.toolUseId) continue
      const item = toolsByUseId.get(block.toolUseId)
      if (!item) continue
      const name = item.use?.name ?? ''

      if (BACKGROUND_TASK_TOOL_NAMES.has(name)) {
        const taskId = backgroundTaskIdFromResult(block)
        if (taskId) {
          updateBackgroundTask(item, { taskId, status: 'running' })
          tasksById.set(taskId, item)
        }
        continue
      }

      if (TASK_OUTPUT_TOOL_NAMES.has(name)) {
        const update = taskOutputUpdate(item, block)
        const target = update ? tasksById.get(update.taskId) : undefined
        if (target && update) updateBackgroundTask(target, update)
        continue
      }

      if (TASK_STOP_TOOL_NAMES.has(name)) {
        const taskId =
          recordString(block.toolUseResult, ['taskId', 'task_id', 'id']) ||
          recordString(item.use?.input, ['taskId', 'task_id', 'id'])
        const target = taskId ? tasksById.get(taskId) : undefined
        if (target && taskId && !block.isError) {
          updateBackgroundTask(target, { taskId, status: 'stopped' })
        }
      }
    }
  }
}
