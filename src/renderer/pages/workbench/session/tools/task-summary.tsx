import { ListTodo } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import type { ClaudeTaskItem } from '../conversation/types'
import { TodoStatusBox } from './todo-write/status-box'

/** Latest-state card of the tasks tracked by a task list: checkbox rows with a tally. */
export function TaskSummary({ tasks }: { tasks: ClaudeTaskItem[] }) {
  const { t } = useTranslation()
  const settled = tasks.filter(
    (task) => task.status === 'completed' || task.status === 'cancelled',
  ).length

  return (
    <div className="min-w-0">
      <section className="min-w-0 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-sm leading-5 text-foreground-subtlest">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <div className="inline-flex min-w-0 items-center gap-1.5 text-foreground-subtlest">
            <ListTodo className="size-3.5 shrink-0 text-foreground-subtlest" />
            <span className="truncate">{t('workbench.timeline.tasks')}</span>
          </div>
          <span className="shrink-0 tabular-nums text-foreground-subtlest">
            {settled}/{tasks.length}
          </span>
        </div>
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <TaskSummaryRow key={task.id} task={task} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function TaskSummaryRow({ task }: { task: ClaudeTaskItem }) {
  const settled = task.status === 'completed' || task.status === 'cancelled'
  const detail =
    task.status === 'in_progress' ? task.activeForm || task.description : task.description

  return (
    <li className="flex min-w-0 items-start gap-2">
      <TodoStatusBox mode="static" status={task.status} />
      <div className="min-w-0">
        <div
          className={cn(
            'min-w-0 wrap-break-word',
            settled && 'text-foreground-subtlest line-through',
          )}
        >
          {task.subject}
        </div>
        {detail ? (
          <div className="mt-0.5 wrap-break-word text-xs leading-4 text-foreground-subtlest">
            {detail}
          </div>
        ) : null}
      </div>
    </li>
  )
}
