import type { ClaudeToolRequest } from '../../../../services/claude/claude'
import { parseWorkflowLaunch } from '../../../../services/claude/workflow'
import type { ConversationTimelineItem } from './types'

export type TurnTerminalStatus = 'interrupted' | 'failed'

const ACTIVE_STATUSES = new Set(['async_launched', 'remote_launched', 'running', 'in_progress'])
const AGENT_TOOL_NAMES = new Set(['Agent', 'AgentTool', 'Task'])
const WORKFLOW_TOOL_NAMES = new Set(['Workflow', 'WorkflowTool'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function stringField(value: unknown, key: string): string | undefined {
  const field = record(value)[key]
  return typeof field === 'string' && field.trim() ? field.trim() : undefined
}

function hasConfirmedBackgroundLaunch(
  item: Extract<ConversationTimelineItem, { kind: 'tool' }>,
): boolean {
  const name = item.use?.name ?? ''
  const toolUseResult = item.result?.toolUseResult

  if (AGENT_TOOL_NAMES.has(name)) {
    return Boolean(
      stringField(toolUseResult, 'agentId') ||
      stringField(toolUseResult, 'agent_id') ||
      stringField(toolUseResult, 'taskId') ||
      stringField(toolUseResult, 'task_id'),
    )
  }

  if (WORKFLOW_TOOL_NAMES.has(name)) {
    const launch = parseWorkflowLaunch({
      input: item.use?.input,
      result: item.result?.content,
      toolUseResult,
    })
    return Boolean(launch.runId || launch.taskId)
  }

  return false
}

export function isTimelineToolRunning(
  item: Extract<ConversationTimelineItem, { kind: 'tool' }>,
  {
    isStreaming,
    pendingRequest,
    turnTerminalStatus,
  }: {
    isStreaming: boolean
    pendingRequest?: ClaudeToolRequest
    turnTerminalStatus?: TurnTerminalStatus
  },
): boolean {
  if (item.backgroundTask) return item.backgroundTask.status === 'running'

  const status = stringField(item.result?.toolUseResult, 'status')
  if (status && ACTIVE_STATUSES.has(status)) {
    return turnTerminalStatus ? hasConfirmedBackgroundLaunch(item) : true
  }

  if (turnTerminalStatus) return false
  return Boolean(
    isStreaming && item.use && !item.result && !item.coalescedReads?.length && !pendingRequest,
  )
}
