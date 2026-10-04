import { Fragment, type ReactElement } from 'react'

import { Separator } from '@/shadcn/separator'

import { type TodoItem, todoStats } from '../../../services/claude/todo'
import { SubagentProgress } from './subagent-progress'
import type { SessionSubagent } from './subagents'
import { TodoProgress } from './tools/todo-write/progress'
import { WorkflowProgress } from './tools/workflow-progress'
import type { WorkflowSubagentGroup, WorkflowSubagentTarget } from './use-subagents'

/**
 * Single pill-shaped panel above the input. Todo, running-subagent, and workflow sections show
 * only while present, separated by vertical dividers.
 */
export function TaskProgressPanel({
  onOpenAgent,
  runningSubagents,
  subagentStats,
  todos,
  workflows,
}: {
  onOpenAgent: (target: WorkflowSubagentTarget) => void
  runningSubagents: SessionSubagent[]
  subagentStats: { done: number; total: number }
  todos: TodoItem[]
  workflows: WorkflowSubagentGroup[]
}) {
  const todoProgress = todoStats(todos)
  const sections = [
    todoProgress.total > 0 && todoProgress.completed < todoProgress.total ? (
      <TodoProgress key="todos" todos={todos} />
    ) : null,
    runningSubagents.length ? (
      <SubagentProgress key="subagents" running={runningSubagents} stats={subagentStats} />
    ) : null,
    workflows.length ? (
      <WorkflowProgress key="workflows" workflows={workflows} onOpenAgent={onOpenAgent} />
    ) : null,
  ].filter((section): section is ReactElement => Boolean(section))

  if (!sections.length) return null

  return (
    <div className="flex justify-center">
      <div className="flex items-center rounded-full border border-border/60 bg-card/85 py-1 text-xs text-foreground-subtlest shadow-(--prompt-composer-shadow) backdrop-blur">
        {sections.map((section, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <div className="mx-1 flex items-center">
                <Separator orientation="vertical" className="h-3.5" />
              </div>
            ) : null}
            {section}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
