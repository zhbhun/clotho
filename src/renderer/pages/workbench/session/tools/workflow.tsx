import type { TFunction } from 'i18next'
import { Check, ChevronRight, CircleDashed, Clock3, LoaderCircle, Waypoints, X } from 'lucide-react'
import { Fragment, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Separator } from '@/shadcn/separator'
import { cn } from '@/shadcn/utils'

import type {
  ClaudeWorkflowAgent,
  ClaudeWorkflowPhase,
  ClaudeWorkflowRun,
  ClaudeWorkflowStatus,
} from '../../../../services/claude/claude'
import { parseWorkflowLaunch } from '../../../../services/claude/workflow'
import type { WorkflowRef } from '../use-workflows'
import { useWorkflowContext } from '../workflow-context'
import type { ToolItemContext, ToolRenderer } from './shared/types'

function statusLabel(status: ClaudeWorkflowStatus, t: TFunction) {
  if (status === 'completed') return t('tools.workflow.completed')
  if (status === 'failed') return t('tools.workflow.failed')
  if (status === 'stopped') return t('tools.workflow.stopped')
  if (status === 'running') return t('tools.workflow.running')
  return t('tools.workflow.starting')
}

function statusVariant(status: ClaudeWorkflowStatus): 'destructive' | 'outline' | 'secondary' {
  if (status === 'failed') return 'destructive'
  if (status === 'completed') return 'secondary'
  return 'outline'
}

function isAgentRunning(state: string) {
  return state === 'running' || state === 'in_progress'
}

function isAgentFailed(state: string) {
  return state === 'failed' || state === 'error'
}

function isAgentDone(state: string) {
  return state === 'done' || state === 'completed'
}

function isAgentStopped(state: string) {
  return state === 'stopped' || state === 'cancelled' || state === 'aborted'
}

function formatDuration(milliseconds?: number) {
  if (milliseconds === undefined) return ''
  if (milliseconds < 1_000) return `${Math.round(milliseconds)}ms`
  const seconds = milliseconds / 1_000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const roundedSeconds = Math.round(seconds)
  return `${Math.floor(roundedSeconds / 60)}m ${roundedSeconds % 60}s`
}

function formatCompactNumber(value: number) {
  const absoluteValue = Math.abs(value)
  const unit = absoluteValue >= 1_000_000 ? 1_000_000 : absoluteValue >= 1_000 ? 1_000 : 1
  return Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: absoluteValue / unit >= 100 ? 0 : 1,
  }).format(value)
}

function agentProgressSummary(agent: ClaudeWorkflowAgent) {
  if (isAgentDone(agent.state)) return ''
  if (isAgentRunning(agent.state)) return agent.lastToolSummary || agent.promptPreview || ''
  if (isAgentFailed(agent.state) || isAgentStopped(agent.state)) {
    return agent.lastToolSummary || agent.resultPreview || ''
  }
  return ''
}

function workflowPhases(run: ClaudeWorkflowRun, t: TFunction): ClaudeWorkflowPhase[] {
  const phases = new Map(run.phases.map((phase) => [phase.index, phase]))
  for (const agent of run.agents) {
    if (!phases.has(agent.phaseIndex)) {
      phases.set(agent.phaseIndex, {
        index: agent.phaseIndex,
        title:
          agent.phaseTitle ?? t('tools.workflow.phaseFallback', { count: agent.phaseIndex + 1 }),
      })
    }
  }
  return Array.from(phases.values()).toSorted((left, right) => left.index - right.index)
}

function WorkflowAgentNode({
  agent,
  onOpen,
}: {
  agent: ClaudeWorkflowAgent
  onOpen?: (agent: ClaudeWorkflowAgent) => void
}) {
  const { t } = useTranslation()
  const summary = agentProgressSummary(agent)
  const canOpen = Boolean(agent.agentId && onOpen)
  const metadata = [
    agent.model,
    agent.durationMs !== undefined ? formatDuration(agent.durationMs) : '',
    agent.tokens !== undefined
      ? t('tools.workflow.tokens', { count: formatCompactNumber(agent.tokens) })
      : '',
  ].filter(Boolean)
  const StateIcon = isAgentRunning(agent.state)
    ? LoaderCircle
    : isAgentDone(agent.state)
      ? Check
      : isAgentFailed(agent.state)
        ? X
        : CircleDashed

  return (
    <div
      className={cn(
        'group min-w-0 rounded-md border border-border/60 bg-background px-2.5 py-2',
        canOpen && 'cursor-pointer transition-colors hover:border-border hover:bg-muted/50',
      )}
      data-workflow-agent-id={agent.agentId}
      onClick={() => canOpen && onOpen?.(agent)}
    >
      <div className="flex min-w-0 items-center gap-2">
        <div
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-foreground-subtle',
            isAgentFailed(agent.state) && 'bg-destructive/10 text-destructive',
          )}
        >
          <StateIcon className={cn('size-3', isAgentRunning(agent.state) && 'animate-spin')} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{agent.label}</p>
          {metadata.length ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[0.625rem] tabular-nums text-foreground-subtlest">
              {metadata.map((item, index) => (
                <Fragment key={`${index}:${item}`}>
                  {index ? <span aria-hidden>·</span> : null}
                  <span>{item}</span>
                </Fragment>
              ))}
            </div>
          ) : null}
          {summary ? (
            <p className="mt-1 truncate text-xs text-foreground-subtle" title={summary}>
              {summary}
            </p>
          ) : null}
        </div>
        {canOpen ? (
          <ChevronRight className="size-3 shrink-0 text-foreground-subtlest opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100" />
        ) : null}
      </div>
    </div>
  )
}

function WorkflowRunView({
  launch,
  run,
  launchFailed,
  launchError,
  onOpenAgent,
}: {
  launch: WorkflowRef
  run?: ClaudeWorkflowRun
  launchFailed?: boolean
  launchError?: string
  onOpenAgent?: ReturnType<typeof useWorkflowContext>['onOpenAgent']
}) {
  const { t } = useTranslation()
  const status = run?.status ?? (launchFailed ? 'failed' : 'starting')
  const isPartial = Boolean(run?.isPartial)
  const phases = useMemo(() => (run ? workflowPhases(run, t) : []), [run, t])
  const summary = run?.summary ?? launch.summary
  const openAgent = onOpenAgent
    ? (selected: ClaudeWorkflowAgent) => {
        if (!selected.agentId) return
        onOpenAgent({
          agentId: selected.agentId,
          label: selected.label,
          prompt: selected.promptPreview,
          startedAt: selected.startedAt,
          state: selected.state,
        })
      }
    : undefined

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-start justify-between gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {summary ? <p className="text-xs text-foreground-subtle">{summary}</p> : null}
          {run ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.625rem] text-foreground-subtlest">
              {run.durationMs !== undefined ? (
                <span
                  className="inline-flex items-center gap-1 tabular-nums"
                  title={t('tools.workflow.elapsedDescription')}
                >
                  <Clock3 className="size-2.5" />
                  {t('tools.workflow.elapsed', { duration: formatDuration(run.durationMs) })}
                </span>
              ) : null}
              {run.agentCount !== undefined ? (
                <span>{t('tools.workflow.agentCount', { count: run.agentCount })}</span>
              ) : null}
              {run.totalTokens !== undefined ? (
                <span className="tabular-nums">
                  {t('tools.workflow.tokens', { count: formatCompactNumber(run.totalTokens) })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <Badge variant={statusVariant(status)}>{statusLabel(status, t)}</Badge>
      </div>

      <Separator />
      {run && isPartial ? (
        <div className="px-3 py-3">
          {run.agents.length ? (
            <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
              {run.agents
                .toSorted((left, right) => left.index - right.index)
                .map((agent) => (
                  <WorkflowAgentNode
                    key={`${agent.index}:${agent.agentId ?? agent.label}`}
                    agent={agent}
                    onOpen={openAgent}
                  />
                ))}
            </div>
          ) : (
            <p className="text-xs text-foreground-subtlest">
              {t('tools.workflow.waitingForAgents')}
            </p>
          )}
        </div>
      ) : run ? (
        <div className="px-3 py-3">
          <div className="flex flex-col">
            {phases.map((phase, phasePosition) => {
              const agents = run.agents
                .filter((agent) => agent.phaseIndex === phase.index)
                .toSorted((left, right) => left.index - right.index)
              return (
                <div
                  key={phase.index}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2"
                  data-testid={`workflow-phase-${phase.index}`}
                >
                  <div className="relative flex justify-center">
                    {phasePosition < phases.length - 1 ? (
                      <div className="absolute inset-y-5 w-px bg-border" />
                    ) : null}
                    <div
                      className="relative flex size-5 items-center justify-center rounded-full border border-border bg-background font-mono text-[0.625rem] text-foreground-subtle"
                      data-testid={`workflow-phase-step-${phase.index}`}
                    >
                      {phasePosition + 1}
                    </div>
                  </div>
                  <div className={cn('min-w-0', phasePosition < phases.length - 1 && 'pb-4')}>
                    <div className="mb-2 min-w-0">
                      <p className="text-xs font-medium text-foreground">{phase.title}</p>
                      {phase.detail ? (
                        <p className="mt-0.5 text-[0.6875rem] text-foreground-subtlest">
                          {phase.detail}
                        </p>
                      ) : null}
                    </div>
                    {agents.length ? (
                      <div className="grid min-w-0 grid-cols-1 gap-1.5 sm:grid-cols-2">
                        {agents.map((agent) => (
                          <WorkflowAgentNode
                            key={`${agent.index}:${agent.agentId ?? agent.label}`}
                            agent={agent}
                            onOpen={openAgent}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-foreground-subtlest">
                        {t('tools.workflow.waitingForPhase')}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="px-3 py-3 text-xs text-foreground-subtle">
          {launchFailed
            ? launchError || t('tools.workflow.creationFailed')
            : t('tools.workflow.waitingForRun')}
        </div>
      )}
    </div>
  )
}

function WorkflowToolItem(context: ToolItemContext) {
  const workflows = useWorkflowContext()
  const contextualRef = workflows.refs.find((ref) => ref.toolUseId === context.toolUseId)
  const parsedLaunch = parseWorkflowLaunch({
    input: context.input,
    result: context.result,
    toolUseResult: context.toolUseResult,
  })
  const runId = contextualRef?.runId ?? parsedLaunch.runId ?? ''
  const fallbackRef: WorkflowRef = {
    runId,
    toolUseId: context.toolUseId ?? '',
    taskId: parsedLaunch.taskId,
    workflowName: parsedLaunch.workflowName,
    summary: parsedLaunch.summary,
    script: parsedLaunch.script,
  }
  return (
    <WorkflowRunView
      launch={contextualRef ?? fallbackRef}
      run={runId ? workflows.runs[runId] : undefined}
      launchFailed={context.isError}
      launchError={context.isError ? context.result : undefined}
      onOpenAgent={workflows.onOpenAgent}
    />
  )
}

export const workflowRenderer: ToolRenderer = {
  icon: Waypoints,
  label: 'tools.Workflow.label',
  description: 'tools.workflow.description',
  summary: (input, result, toolUseResult) =>
    parseWorkflowLaunch({ input, result, toolUseResult }).workflowName ?? '',
  inputView: () => null,
  hasBody: () => true,
  bodyItemView: (context) => <WorkflowToolItem {...context} />,
  flushBody: true,
}
