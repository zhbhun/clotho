import { ClipboardList } from 'lucide-react'

import { extractTaskDetail, normalizeTaskStatus } from './shared/task'
import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'
import { TodoStatusBox } from './todo-write/status-box'

export const taskGetRenderer: ToolRenderer = {
  icon: ClipboardList,
  label: 'tools.TaskGet.label',
  description: 'tools.taskGet.description',
  summary: (input, _result, toolUseResult) =>
    extractTaskDetail(toolUseResult)?.subject || pickString(input, ['taskId', 'task_id', 'id']),
  inputView: () => null,
  hasBody: (_input, _result, _images, toolUseResult) => Boolean(extractTaskDetail(toolUseResult)),
  bodyView: (_input, _result, _images, toolUseResult) => (
    <TaskDetailBody toolUseResult={toolUseResult} />
  ),
}

function TaskDetailBody({ toolUseResult }: { toolUseResult?: unknown }) {
  const task = extractTaskDetail(toolUseResult)
  if (!task) return null

  const status = normalizeTaskStatus(task.status)
  return (
    <div className="flex min-w-0 items-start gap-2">
      <TodoStatusBox mode="static" status={status} />
      <div className="min-w-0">
        <div className="break-words text-foreground-subtlest">{task.subject}</div>
        {task.description ? (
          <div className="mt-0.5 break-words text-xs leading-4 text-foreground-subtlest">
            {task.description}
          </div>
        ) : null}
      </div>
    </div>
  )
}
