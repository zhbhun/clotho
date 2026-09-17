import { useMemo } from 'react'

import { type TodoItem, extractTodoItems, isTodoWriteToolName } from '../../../services/claude/todo'
import type { ClaudeMessage } from './services/message'
import { type SessionSubagent, directRunningSubagents } from './subagents'
import type { WorkflowSubagentGroup } from './use-subagents'

export interface TaskProgress {
  activeWorkflowGroups: WorkflowSubagentGroup[]
  hasActiveTodoExecution: boolean
  hasTaskProgress: boolean
  latestTodos: TodoItem[]
  runningSubagents: SessionSubagent[]
}

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

/** Aggregate todo, subagent, and workflow progress for the currently viewed message list. */
export function useTaskProgress({
  isStreaming,
  messages,
  subagents,
  workflowGroups,
}: {
  isStreaming: boolean
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
  const hasActiveTodoExecution = isStreaming || runningSubagents.length > 0
  const hasTaskProgress =
    (hasActiveTodoExecution && latestTodos.some((todo) => todo.status !== 'completed')) ||
    runningSubagents.length > 0 ||
    activeWorkflowGroups.length > 0
  return {
    activeWorkflowGroups,
    hasActiveTodoExecution,
    hasTaskProgress,
    latestTodos,
    runningSubagents,
  }
}
