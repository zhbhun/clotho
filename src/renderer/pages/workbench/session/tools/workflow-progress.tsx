import { Check, ChevronRight, LoaderCircle, Workflow as WorkflowIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/shadcn/popover'
import { Separator } from '@/shadcn/separator'
import { cn } from '@/shadcn/utils'

import type { WorkflowSubagentGroup, WorkflowSubagentTarget } from '../use-subagents'

function isTerminal(status: WorkflowSubagentGroup['status']) {
  return status === 'completed' || status === 'failed' || status === 'stopped'
}

function isAgentDone(state?: string) {
  return state === 'done' || state === 'completed'
}

export function WorkflowProgress({
  workflows,
  onOpenAgent,
}: {
  workflows: WorkflowSubagentGroup[]
  onOpenAgent?: (target: WorkflowSubagentTarget) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const activeWorkflows = workflows.filter((workflow) => !isTerminal(workflow.status))
  if (!activeWorkflows.length) return null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <div className="flex cursor-pointer items-center gap-2 rounded-full border border-border/60 bg-card/85 px-3 py-1 text-xs text-foreground-subtlest shadow-sm backdrop-blur transition-colors hover:border-border" />
        }
      >
        <WorkflowIcon className="size-3.5" />
        <span>{t('tools.workflow.progressTitle')}</span>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-1.5"
        side="top"
        sideOffset={6}
      >
        {activeWorkflows.map((workflow, workflowIndex) => (
          <div key={workflow.runId}>
            {workflowIndex ? <Separator className="my-1" /> : null}
            {workflow.summary ? (
              <div className="px-2 py-1.5">
                <PopoverTitle className="truncate text-xs text-foreground-subtlest">
                  {workflow.summary}
                </PopoverTitle>
              </div>
            ) : null}
            {workflow.agents.length ? (
              <div className="flex flex-col">
                {workflow.agents.map((agent) => {
                  const done = isAgentDone(agent.state)
                  const StateIcon = done ? Check : LoaderCircle
                  return (
                    <div
                      key={agent.agentId}
                      className="group flex min-w-0 cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-muted/60"
                      data-testid={`workflow-progress-agent-${agent.agentId}`}
                      data-workflow-agent-state={agent.state}
                      onClick={() => {
                        onOpenAgent?.(agent)
                        setOpen(false)
                      }}
                    >
                      <StateIcon className={cn('size-3.5 shrink-0', !done && 'animate-spin')} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-foreground-subtle">{agent.label}</p>
                        {agent.prompt ? (
                          <p className="truncate text-[0.6875rem] text-foreground-subtlest">
                            {agent.prompt}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRight className="size-3.5 shrink-0 text-foreground-subtlest/60 opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2 py-2 text-foreground-subtlest">
                <LoaderCircle className="size-3.5 animate-spin" />
                <span>{t('tools.workflow.waitingForAgents')}</span>
              </div>
            )}
          </div>
        ))}
      </PopoverContent>
    </Popover>
  )
}
