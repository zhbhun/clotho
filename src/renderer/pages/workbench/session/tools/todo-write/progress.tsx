import { ListTodo } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/popover'
import { cn } from '@/shadcn/utils'

import { type TodoItem, todoStats } from '../../../../../services/claude/todo'
import { TodoStatusBox } from './status-box'

/**
 * Todo progress section: explicit count without a bar; hovering expands the todo list.
 * Shared panel styling with the sibling pill sections in TaskProgressPanel.
 */
export function TodoProgress({ todos }: { todos: TodoItem[] }) {
  const progress = todoStats(todos)
  if (!progress.total || progress.completed === progress.total) return null

  return (
    <Popover>
      <PopoverTrigger
        closeDelay={120}
        delay={0}
        nativeButton={false}
        openOnHover
        render={
          <div className="flex cursor-pointer items-center gap-2 px-2 py-0.5 transition-colors hover:text-foreground" />
        }
      >
        <ListTodo className="size-3.5" />
        <span className="tabular-nums">
          {progress.completed}/{progress.total}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="w-[min(420px,90vw)] gap-0 p-1.5 shadow-float"
      >
        <ul className="flex flex-col">
          {todos.map((todo, index) => (
            <TodoRow key={index} todo={todo} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
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
