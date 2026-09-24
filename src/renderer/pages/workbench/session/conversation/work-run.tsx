import { Brain, ChevronRight, LineSquiggle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { ShinyText } from '../../../../components/shiny-text'
import type { ClaudeToolRequest, ClaudeToolResult } from '../../../../services/claude/claude'
import { getToolRenderer, getToolSummary } from '../tools/registry'
import { ToolIcon } from '../tools/shared/content'
import { TimelineEntry, TimelineRow } from './timeline'
import type { TurnTerminalStatus } from './tool-state'
import type { ConversationTimelineItem } from './types'
import { type WorkRunCountKey, summarizeWorkRun, workRunHeader } from './work-runs'

const COUNT_LABELS: Record<WorkRunCountKey, string> = {
  agents: 'workbench.workRun.dispatchedAgents',
  commands: 'workbench.workRun.ranCommands',
  filesEdited: 'workbench.workRun.editedFiles',
  filesRead: 'workbench.workRun.readFiles',
  other: 'workbench.workRun.usedOtherTools',
  searches: 'workbench.workRun.searchedFiles',
  tasks: 'workbench.workRun.updatedTasks',
  thought: 'workbench.workRun.thoughtTimes',
  web: 'workbench.workRun.visitedPages',
}

/** Sentence-style summary line: uppercase the leading letter for scripts that have case. */
function capitalizeSummary(text: string) {
  const leading = text.charAt(0)
  return leading ? leading.toLocaleUpperCase() + text.slice(1) : text
}

export function WorkRunRow({
  compactAfter,
  isActive,
  isExpanded,
  isLast,
  isStreaming,
  items,
  onOpenSubagent,
  pendingRequests,
  projectPath,
  turnTerminalStatus,
  onRespond,
  onToggle,
}: {
  compactAfter: boolean
  isActive: boolean
  isExpanded: boolean
  isLast: boolean
  isStreaming: boolean
  items: ConversationTimelineItem[]
  onOpenSubagent?: (toolUseId: string) => void
  pendingRequests?: Record<string, ClaudeToolRequest>
  projectPath?: string
  turnTerminalStatus?: TurnTerminalStatus
  onRespond?: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
  onToggle: () => void
}) {
  const { t, i18n } = useTranslation()
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string
  const header = workRunHeader(items, {
    isActive,
    isStreaming,
    pendingRequests,
    turnTerminalStatus,
  })
  const parts = summarizeWorkRun(items).parts.map(({ countKey, count }) =>
    translate(COUNT_LABELS[countKey], { count }),
  )
  const separator = /^zh|ja/.test(i18n.language) ? '，' : ', '

  const runningTool = header.kind === 'running' ? header.tool : undefined
  const runningRenderer = runningTool ? getToolRenderer(runningTool.use?.name) : undefined
  const runningSummary =
    runningTool && runningRenderer
      ? getToolSummary({
          name: runningTool.use?.name,
          input: runningTool.use?.input,
          renderer: runningRenderer,
          projectPath,
          result: runningTool.result?.content,
          t,
          toolUseResult: runningTool.result?.toolUseResult,
        })
      : ''
  const runningLabel = runningRenderer
    ? [translate(runningRenderer.label), runningSummary].filter(Boolean).join(' ')
    : ''
  const isThinkingHeader = header.kind === 'thinking'

  return (
    <div className="min-w-0">
      <TimelineRow compactAfter={isExpanded ? true : compactAfter} isLast={isLast && !isExpanded}>
        <button
          aria-expanded={isExpanded}
          className="group inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-sm text-left leading-6 text-foreground-subtle transition-colors hover:text-foreground"
          type="button"
          onClick={onToggle}
        >
          {runningTool && runningRenderer ? (
            <ToolIcon
              className="motion-safe:animate-pulse text-foreground"
              description={translate(runningRenderer.description)}
              icon={runningRenderer.icon}
            />
          ) : (
            <span className="inline-flex shrink-0 text-foreground-subtlest transition-colors group-hover:text-foreground">
              {isThinkingHeader ? (
                <Brain aria-hidden className="size-3.5" />
              ) : (
                <LineSquiggle aria-hidden className="size-3.5" />
              )}
            </span>
          )}
          {isThinkingHeader ? (
            <ShinyText text={t('workbench.conversation.thinking')} />
          ) : (
            <span className="min-w-0 truncate text-foreground-subtlest transition-colors group-hover:text-foreground">
              {header.kind === 'running' ? runningLabel : capitalizeSummary(parts.join(separator))}
            </span>
          )}
          <ChevronRight
            className={cn(
              'size-3.5 shrink-0 text-foreground-subtlest opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100',
              isExpanded && 'rotate-90 opacity-100',
            )}
          />
        </button>
      </TimelineRow>

      {isExpanded
        ? items.map((item, index) => {
            const nextItem = items[index + 1]
            return (
              <TimelineEntry
                compactAfter={Boolean(item.kind !== 'text' && nextItem && nextItem.kind !== 'text')}
                defaultToolOpen={false}
                isLast={isLast && index === items.length - 1}
                isStreaming={isStreaming}
                item={item}
                key={item.id}
                onOpenSubagent={onOpenSubagent}
                pendingRequests={pendingRequests}
                projectPath={projectPath}
                turnTerminalStatus={turnTerminalStatus}
                onRespond={onRespond}
              />
            )
          })
        : null}
    </div>
  )
}
