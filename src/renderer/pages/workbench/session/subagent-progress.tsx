import { GitFork } from 'lucide-react'

import { ProgressSection } from './progress-section'
import type { SessionSubagent } from './subagents'

/**
 * Running-subagent section: finished-versus-dispatched count, shown only while at least one direct
 * subagent is running; hover expands the running list.
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
    <ProgressSection
      icon={<GitFork className="size-3.5" />}
      popover={
        <ul className="flex flex-col">
          {running.map((subagent) => (
            <SubagentRow key={subagent.id} subagent={subagent} />
          ))}
        </ul>
      }
    >
      <span className="tabular-nums">
        {stats.done}/{stats.total}
      </span>
    </ProgressSection>
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
