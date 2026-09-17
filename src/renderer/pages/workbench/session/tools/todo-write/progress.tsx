import { Bot, ListTodo } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Separator } from '@/shadcn/separator'
import { cn } from '@/shadcn/utils'

import { type TodoItem, todoStats } from '../../../../../services/claude/todo'
import type { SessionSubagent } from '../../subagents'
import { TodoStatusBox } from './status-box'

const CLOSE_GRACE_MS = 120

/**
 * Global Todo progress block: centered above the input with a count and mini progress bar; hover expands the task list.
 * Render nothing without todos. Render the expanded list through a portal to body to avoid outer overflow clipping.
 */
export function TodoProgress({
  showTodos = true,
  todos,
  subagents = [],
}: {
  showTodos?: boolean
  todos: TodoItem[]
  subagents?: SessionSubagent[]
}) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const show = () => {
    cancelClose()
    setOpen(true)
  }
  const scheduleHide = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS)
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const box = triggerRef.current.getBoundingClientRect()
    setRect({ left: box.left, top: box.top, width: box.width })
  }, [open])

  useLayoutEffect(() => () => cancelClose(), [])

  const visibleTodos = showTodos ? todos : []
  const todoProgress = todoStats(visibleTodos)
  const runningSubagents = subagents.filter((subagent) => subagent.status === 'running')
  const total = todoProgress.total + runningSubagents.length
  const completed = todoProgress.completed
  const pct = total ? Math.round((completed / total) * 100) : 0
  if (!total || completed === total) return null

  return (
    <>
      <div className="flex justify-center">
        <div
          ref={triggerRef}
          className="flex items-center gap-2 rounded-full border border-border/60 bg-card/85 px-3 py-1 text-xs text-foreground-subtlest shadow-sm backdrop-blur transition-colors hover:border-border"
          onMouseEnter={show}
          onMouseLeave={scheduleHide}
        >
          <ListTodo className="size-3.5" />
          <span className="tabular-nums">
            {completed}/{total}
          </span>
          <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </span>
        </div>
      </div>

      {open && rect
        ? createPortal(
            <div
              className="fixed z-50 w-[min(420px,90vw)] -translate-x-1/2 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-popover"
              data-glass="true"
              style={{
                left: rect.left + rect.width / 2,
                bottom: window.innerHeight - rect.top + 6,
              }}
              onMouseEnter={show}
              onMouseLeave={scheduleHide}
            >
              {visibleTodos.length ? (
                <ul className="flex flex-col">
                  {visibleTodos.map((todo, index) => (
                    <TodoRow key={index} todo={todo} />
                  ))}
                </ul>
              ) : null}
              {visibleTodos.length && runningSubagents.length ? (
                <Separator className="my-1" />
              ) : null}
              {runningSubagents.length ? (
                <ul className="flex flex-col">
                  {runningSubagents.map((subagent) => (
                    <SubagentRow key={subagent.id} subagent={subagent} />
                  ))}
                </ul>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function SubagentRow({ subagent }: { subagent: SessionSubagent }) {
  return (
    <li className="flex items-start gap-2 rounded px-1.5 py-1 text-xs leading-5">
      <Bot className="mt-0.5 size-3.5 shrink-0 text-foreground-subtlest" />
      <span className="min-w-0 flex-1 truncate text-foreground-subtlest">
        {subagent.description}
      </span>
      <span className="shrink-0 font-mono text-foreground-subtlest/60">{subagent.agentType}</span>
    </li>
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
