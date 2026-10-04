import { useMemo } from 'react'

import { type TodoItem, extractTodoItems, isTodoWriteToolName } from '../../../services/claude/todo'
import type { ClaudeMessage } from './services/message'
import {
  type SessionSubagent,
  type SessionSubagentStatus,
  directRunningSubagents,
} from './subagents'
import type { WorkflowSubagentGroup } from './use-subagents'

export interface TaskProgress {
  activeWorkflowGroups: WorkflowSubagentGroup[]
  hasTaskProgress: boolean
  latestTodos: TodoItem[]
  runningSubagents: SessionSubagent[]
  subagentStats: { done: number; total: number }
}

const TERMINAL_SUBAGENT_STATUSES = new Set<SessionSubagentStatus>([
  'completed',
  'failed',
  'stopped',
])

function findLatestTodos(messages: ClaudeMessage[]): TodoItem[] {
  let latest: TodoItem[] | null = null
  for (const message of messages) {
    for (const block of message.blocks ?? []) {
      if (block.type !== 'tool_use' || !isTodoWriteToolName(block.name)) continue
      const todos = extractTodoItems(block.input)
      if (todos.length) latest = todos
    }
  }
  return latest ?? []
}

/**
 * Aggregate todo, subagent, and workflow progress for the currently viewed message list. Todos
 * and subagents stay separate: todos render their own pill, running subagents theirs.
 */
export function useTaskProgress({
  messages,
  subagents,
  workflowGroups,
}: {
  messages: ClaudeMessage[]
  subagents: SessionSubagent[]
  workflowGroups: WorkflowSubagentGroup[]
}): TaskProgress {
  const latestTodos = useMemo(() => findLatestTodos(messages), [messages])
  const runningSubagents = useMemo(
    () => directRunningSubagents(messages, subagents),
    [messages, subagents],
  )
  const activeWorkflowGroups = useMemo(
    () =>
      workflowGroups.filter(
        (workflow) =>
          workflow.status !== 'completed' &&
          workflow.status !== 'failed' &&
          workflow.status !== 'stopped',
      ),
    [workflowGroups],
  )
  const subagentStats = useMemo(
    () => ({
      done: subagents.filter((subagent) => TERMINAL_SUBAGENT_STATUSES.has(subagent.status)).length,
      total: subagents.length,
    }),
    [subagents],
  )
  const hasTaskProgress =
    latestTodos.some((todo) => todo.status !== 'completed') ||
    runningSubagents.length > 0 ||
    activeWorkflowGroups.length > 0
  return {
    activeWorkflowGroups,
    hasTaskProgress,
    latestTodos,
    runningSubagents,
    subagentStats,
  }
}
