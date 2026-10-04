import { ListTodo } from 'lucide-react'

import { cn } from '@/shadcn/utils'

import { type TodoItem, todoStats } from '../../../../../services/claude/todo'
import { ProgressSection } from '../../progress-section'
import { TodoStatusBox } from './status-box'

/**
 * Todo progress section: explicit count without a bar; hover expands the todo list.
 */
export function TodoProgress({ todos }: { todos: TodoItem[] }) {
  const progress = todoStats(todos)
  if (!progress.total || progress.completed === progress.total) return null

  return (
    <ProgressSection
      icon={<ListTodo className="size-3.5" />}
      popover={
        <ul className="flex flex-col">
          {todos.map((todo, index) => (
            <TodoRow key={index} todo={todo} />
          ))}
        </ul>
      }
    >
      <span className="tabular-nums">
        {progress.completed}/{progress.total}
      </span>
    </ProgressSection>
  )
}

function TodoRow({ todo }: { todo: TodoItem }) {
  const done = todo.status === 'completed'
  return (
    <li className="flex items-start gap-2 rounded px-1.5 py-1 text-xs leading-5">
      <TodoStatusBox mode="loading" status={todo.status} />
      <span
        className={cn(
          'min-w-0 break-words',
          done ? 'text-foreground-subtlest/50 line-through' : 'text-foreground-subtlest',
        )}
      >
        {todo.content}
      </span>
    </li>
  )
}
