import type { RefCallback } from 'react'

import { cn } from '@/shadcn/utils'

import { APP_CONTENT_CONTAINER_CLASS } from '../../../components/app-layout'
import type { ClaudeToolRequest, ClaudeToolResult } from '../../../services/claude/claude'
import { PromptComposer, type PromptComposerBaseProps } from './prompt'
import { AskPanel } from './tools/ask-user-question/request-panel'
import { TodoProgress } from './tools/todo-write/progress'
import { WorkflowProgress } from './tools/workflow-progress'
import type { WorkflowSubagentTarget } from './use-subagents'
import type { TaskProgress } from './use-task-progress'

export type ConversationDockProps = {
  askRequests: ClaudeToolRequest[]
  composerProps: PromptComposerBaseProps
  dockRef: RefCallback<HTMLDivElement>
  error: string | null
  isSubagentSelected: boolean
  taskProgress: TaskProgress
  onOpenWorkflowAgent: (target: WorkflowSubagentTarget) => void
  onRespond: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
}

/** Bottom dock floating over the conversation: task progress pills, the ask/prompt input area, and runtime errors. */
export function ConversationDock({
  askRequests,
  composerProps,
  dockRef,
  error,
  isSubagentSelected,
  taskProgress,
  onOpenWorkflowAgent,
  onRespond,
}: ConversationDockProps) {
  if (isSubagentSelected && !taskProgress.hasTaskProgress) return null

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-6" ref={dockRef}>
      <div
        className={cn(
          'pointer-events-auto bg-gradient-to-t from-background via-background/95 to-transparent pb-4',
          APP_CONTENT_CONTAINER_CLASS,
          'flex flex-col gap-3',
        )}
      >
        <div className="flex justify-center gap-2">
          <TodoProgress
            showTodos={taskProgress.hasActiveTodoExecution}
            todos={taskProgress.latestTodos}
            subagents={taskProgress.runningSubagents}
          />
          <WorkflowProgress
            workflows={taskProgress.activeWorkflowGroups}
            onOpenAgent={onOpenWorkflowAgent}
          />
        </div>
        {!isSubagentSelected ? (
          <AskPanel
            fallback={<PromptComposer {...composerProps} slashMenuPlacement="above" />}
            requests={askRequests}
            onRespond={onRespond}
          />
        ) : null}
        {!isSubagentSelected && error ? (
          <p className="truncate text-xs text-destructive" title={error}>
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
