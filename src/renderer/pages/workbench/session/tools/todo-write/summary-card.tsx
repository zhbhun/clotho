import { ListTodo } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { type TodoItem, todoStats } from '../../../../../services/claude/todo'
import { TodoStatusBox } from './status-box'

/** Read-only snapshot card of one TodoWrite call: checkbox rows with a completion tally. */
export function TodoSummary({ className, todos }: { className?: string; todos: TodoItem[] }) {
  const { t } = useTranslation()
  const stats = todoStats(todos)

  return (
    <div className={cn('min-w-0', className)}>
      <section className="min-w-0 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs leading-5 text-foreground-subtlest">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <div className="inline-flex min-w-0 items-center gap-1.5 text-foreground-subtlest">
            <ListTodo className="size-3.5 shrink-0 text-foreground-subtlest" />
            <span className="truncate">{t('workbench.timeline.todos')}</span>
          </div>
          <span className="shrink-0 tabular-nums text-foreground-subtlest">
            {stats.completed}/{stats.total}
          </span>
        </div>
        <ul className="flex flex-col gap-1">
          {todos.map((todo, index) => (
            <TodoSummaryRow key={index} todo={todo} />
          ))}
        </ul>
      </section>
    </div>
  )
}

function TodoSummaryRow({ todo }: { todo: TodoItem }) {
  const done = todo.status === 'completed'

  return (
    <li className="flex min-w-0 items-start gap-2">
      <TodoStatusBox mode="static" status={todo.status} />
      <span
        className={cn(
          'min-w-0 wrap-break-word',
          done ? 'text-foreground-subtlest line-through' : 'text-foreground-subtlest',
        )}
      >
        {todo.content}
      </span>
    </li>
  )
}
