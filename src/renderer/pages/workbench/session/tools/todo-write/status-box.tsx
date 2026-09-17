import { Asterisk, Check, Loader2 } from 'lucide-react'

import { cn } from '@/shadcn/utils'

import type { TodoItem } from '../../../../../services/claude/todo'

type TodoStatusBoxMode = 'loading' | 'static'

export function TodoStatusBox({
  className,
  mode,
  status,
}: {
  className?: string
  mode: TodoStatusBoxMode
  status: TodoItem['status']
}) {
  const done = status === 'completed'
  const inProgress = status === 'in_progress'

  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border',
        done
          ? 'border-foreground-subtle/35 bg-muted/40 text-foreground-subtle/60'
          : 'border-foreground-subtle/55 text-foreground-subtle',
        inProgress && 'border-foreground-subtle/70 text-foreground/80',
        className,
      )}
      data-todo-status-box={status}
    >
      {done ? (
        <Check className="size-2.5" strokeWidth={2.5} />
      ) : inProgress && mode === 'loading' ? (
        <Loader2 className="size-2.5 animate-spin" />
      ) : inProgress ? (
        <Asterisk className="size-2.5" strokeWidth={2.5} />
      ) : null}
    </span>
  )
}
