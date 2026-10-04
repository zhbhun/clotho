import { GitFork } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/shadcn/popover'

import type { SessionSubagent } from './subagents'

/**
 * Running-subagent section: finished-versus-dispatched count, shown only while at least one direct
 * subagent is running; hovering expands the running list. Shared panel styling with the sibling
 * pill sections in TaskProgressPanel.
 */
export function SubagentProgress({
  running,
  stats,
}: {
  running: SessionSubagent[]
  stats: { done: number; total: number }
}) {
  if (!running.length) return null

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
            <SubagentRow key={subagent.id} subagent={subagent} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function SubagentRow({ subagent }: { subagent: SessionSubagent }) {
  return (
    <li className="flex items-start gap-2 rounded px-1.5 py-1 text-xs leading-5">
      <GitFork className="mt-0.5 size-3.5 shrink-0 text-foreground-subtlest" />
      <span className="min-w-0 flex-1 truncate text-foreground-subtlest">
        {subagent.description}
      </span>
      <span className="shrink-0 font-mono text-foreground-subtlest/60">{subagent.agentType}</span>
    </li>
  )
}
