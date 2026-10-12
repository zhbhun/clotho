import { ChevronRight, GitFork } from 'lucide-react'
import { type RefObject, useRef } from 'react'

import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/popover'

import type { SessionSubagent } from './subagents'

/**
 * Running-subagent section: finished-versus-dispatched count, shown only while at least one direct
 * subagent is running; hovering expands the running list and picking a row opens the subagent.
 * Shared panel styling with the sibling pill sections in TaskProgressPanel.
 */
export function SubagentProgress({
  onOpen,
  running,
  stats,
}: {
  onOpen?: (subagent: SessionSubagent) => void
  running: SessionSubagent[]
  stats: { done: number; total: number }
}) {
  // Closes the hover panel imperatively when a subagent row is picked.
  const actionsRef = useRef<{ close: () => void; unmount: () => void } | null>(null)
  if (!running.length) return null

  return (
    <Popover actionsRef={actionsRef}>
      <PopoverTrigger
        closeDelay={120}
        delay={0}
        nativeButton={false}
        openOnHover
        render={
          <div className="flex cursor-pointer items-center gap-2 px-2 py-0.5 transition-colors hover:text-foreground" />
        }
      >
        <GitFork className="size-3.5" />
        <span className="tabular-nums">
          {stats.done}/{stats.total}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="w-[min(420px,90vw)] gap-0 p-1.5 shadow-float"
      >
        <ul className="flex flex-col">
          {running.map((subagent) => (
            <SubagentRow
              key={subagent.id}
              subagent={subagent}
              onOpen={onOpen}
              actionsRef={actionsRef}
            />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function SubagentRow({
  actionsRef,
  onOpen,
  subagent,
}: {
  actionsRef: RefObject<{ close: () => void; unmount: () => void } | null>
  onOpen?: (subagent: SessionSubagent) => void
  subagent: SessionSubagent
}) {
  return (
    <li
      className="group flex min-w-0 cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs leading-5 transition-colors hover:bg-muted/60"
      data-testid={`subagent-progress-${subagent.id}`}
      onClick={() => {
        onOpen?.(subagent)
        actionsRef.current?.close()
      }}
    >
      <GitFork className="size-3.5 shrink-0 text-foreground-subtlest" />
      <span className="min-w-0 flex-1 truncate text-foreground-subtle">{subagent.description}</span>
      <span className="shrink-0 font-mono text-foreground-subtlest/60">{subagent.agentType}</span>
      <ChevronRight className="size-3.5 shrink-0 text-foreground-subtlest/60 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
    </li>
  )
}
