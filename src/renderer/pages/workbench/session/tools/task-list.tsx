import { ListTodo } from 'lucide-react'

import { cn } from '@/shadcn/utils'

import { extractTaskList, normalizeTaskStatus } from './shared/task'
import type { ToolRenderer } from './shared/types'
import { TodoStatusBox } from './todo-write/status-box'

export const taskListRenderer: ToolRenderer = {
  icon: ListTodo,
  label: 'tools.TaskList.label',
  description: 'tools.taskList.description',
  summary: (_input, _result, toolUseResult, t) => {
    const count = extractTaskList(toolUseResult).length
    return count ? (t?.('tools.task.count', { count }) ?? '') : (t?.('tools.taskList.empty') ?? '')
  },
  inputView: () => null,
  hasBody: (_input, _result, _images, toolUseResult) => extractTaskList(toolUseResult).length > 0,
  bodyView: (_input, _result, _images, toolUseResult) => (
    <TaskListBody toolUseResult={toolUseResult} />
  ),
}

function TaskListBody({ toolUseResult }: { toolUseResult?: unknown }) {
  const tasks = extractTaskList(toolUseResult)

  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((task) => {
        const status = normalizeTaskStatus(task.status)
        const done = status === 'completed'
        return (
          <li key={task.id} className="flex min-w-0 items-start gap-2">
            <TodoStatusBox mode="static" status={status} />
            <span
              className={cn(
                'min-w-0 break-words',
                done ? 'text-foreground-subtlest line-through' : 'text-foreground-subtlest',
              )}
            >
              {task.subject}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
