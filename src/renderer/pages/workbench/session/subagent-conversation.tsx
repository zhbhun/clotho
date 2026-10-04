import { CircleAlert, Loader2, RefreshCw } from 'lucide-react'
import { type Ref, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/empty'

import { ShinyText } from '../../../components/shiny-text'
import type { ClaudeToolRequest, ClaudeToolResult } from '../../../services/claude/claude'
import {
  type ConversationRow,
  buildSubagentConversationRows,
} from './conversation/conversation-rows'
import { TimelineEntry, UserCard } from './conversation/timeline'
import { computeSubagentTimeline } from './conversation/turns'
import {
  type VirtualConversationHandle,
  VirtualConversationList,
} from './conversation/virtual-conversation'
import { WorkRunRow } from './conversation/work-run'
import type { ClaudeMessage } from './services/message'
import { type SessionSubagent, isNaturalSubagentUserMessage } from './subagents'

export function SubagentConversation({
  error,
  isLoading,
  messages,
  pendingRequests,
  projectPath,
  scrollMargin = 0,
  status,
  onOpenSubagent,
  onRespond,
  onRetry,
  onTotalSizeChange,
  viewport,
  viewKey = 'subagent',
  virtualListRef,
}: {
  error: string | null
  isLoading: boolean
  messages: ClaudeMessage[]
  pendingRequests?: Record<string, ClaudeToolRequest>
  projectPath?: string
  scrollMargin?: number
  status: SessionSubagent['status']
  onOpenSubagent: (toolUseId: string) => void
  onRespond?: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
  onRetry: () => void
  onTotalSizeChange?: (size: number) => void
  viewport?: HTMLDivElement | null
  viewKey?: string
  virtualListRef?: Ref<VirtualConversationHandle>
}) {
  const { t } = useTranslation()
  const isRunning = status === 'running'
  const [expandedRuns, setExpandedRuns] = useState<Record<string, boolean>>({})
  const toggleRun = useCallback((runId: string) => {
    setExpandedRuns((current) => ({ ...current, [runId]: !current[runId] }))
  }, [])
  const { initialUserMessage, items } = useMemo(() => {
    const userMessageIndex = messages.findIndex(isNaturalSubagentUserMessage)
    const timelineMessages =
      userMessageIndex < 0
        ? messages
        : [...messages.slice(0, userMessageIndex), ...messages.slice(userMessageIndex + 1)]

    return {
      initialUserMessage: userMessageIndex < 0 ? undefined : messages[userMessageIndex],
      items: computeSubagentTimeline(timelineMessages),
    }
  }, [messages])
  const rows = useMemo(
    () =>
      buildSubagentConversationRows({
        expandedRuns,
        initialUserMessage,
        isStreaming: isRunning,
        items,
      }),
    [expandedRuns, initialUserMessage, isRunning, items],
  )
  const firstTimelineKey = rows.find(
    (row) => row.kind === 'timeline' || row.kind === 'work-run',
  )?.key
  const renderRow = useCallback(
    (row: ConversationRow) => {
      if (row.kind === 'user') {
        return (
          <div className="px-3 pt-1">
            <UserCard className="top-11" message={row.message} />
          </div>
        )
      }
      if (row.kind !== 'timeline' && row.kind !== 'work-run') return null

      const rowClassName =
        row.key === firstTimelineKey ? (initialUserMessage ? 'px-3 pt-4' : 'px-3 pt-1') : 'px-3'

      if (row.kind === 'work-run') {
        return (
          <div className={rowClassName}>
            <WorkRunRow
              compactAfter={row.compactAfter}
              isActive={row.isActive}
              isExpanded={row.isExpanded}
              isLast={row.isLast}
              isStreaming={row.isStreaming}
              items={row.items}
              onOpenSubagent={onOpenSubagent}
              pendingRequests={pendingRequests}
              projectPath={projectPath}
              turnTerminalStatus={
                status === 'failed' ? 'failed' : status === 'stopped' ? 'interrupted' : undefined
              }
              onRespond={onRespond}
              onToggle={() => toggleRun(row.runId)}
            />
          </div>
        )
      }

      return (
        <div className={rowClassName}>
          <TimelineEntry
            compactAfter={row.compactAfter}
            isLast={row.isLast}
            isStreaming={isRunning}
            item={row.item}
            onOpenSubagent={onOpenSubagent}
            pendingRequests={pendingRequests}
            projectPath={projectPath}
            turnTerminalStatus={
              status === 'failed' ? 'failed' : status === 'stopped' ? 'interrupted' : undefined
            }
            onRespond={onRespond}
          />
        </div>
      )
    },
    [
      firstTimelineKey,
      initialUserMessage,
      isRunning,
      onOpenSubagent,
      onRespond,
      pendingRequests,
      projectPath,
      status,
      toggleRun,
    ],
  )

  return (
    <div className="flex min-h-full flex-col">
      <div>
        {rows.length ? (
          viewport === undefined ? (
            <div>
              {rows.map((row) => (
                <div key={row.key}>{renderRow(row)}</div>
              ))}
            </div>
          ) : (
            <VirtualConversationList
              estimateSize={estimateSubagentRowSize}
              ref={virtualListRef}
              renderRow={renderRow}
              rows={rows}
              scrollMargin={scrollMargin}
              viewport={viewport}
              viewKey={viewKey}
              onTotalSizeChange={onTotalSizeChange}
            />
          )
        ) : null}

        {!items.length && isLoading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-foreground-subtle">
            <Loader2 className="size-4 animate-spin" />
            <span>{t('workbench.conversation.loadingSubagent')}</span>
          </div>
        ) : !items.length && error ? (
          <Empty className="py-24">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleAlert />
              </EmptyMedia>
              <EmptyTitle>{t('workbench.conversation.subagentLoadFailed')}</EmptyTitle>
              <EmptyDescription>
                {t('workbench.conversation.subagentLoadErrorDescription')}
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" type="button" variant="outline" onClick={onRetry}>
                <RefreshCw data-icon="inline-start" />
                {t('workbench.action.retry')}
              </Button>
            </EmptyContent>
          </Empty>
        ) : !items.length && isRunning ? (
          <div className="px-3 py-24 text-center leading-6" aria-live="polite">
            <ShinyText text={t('workbench.conversation.thinking')} />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function estimateSubagentRowSize(row: ConversationRow) {
  if (row.kind === 'user') return 120
  if (row.kind === 'work-run') {
    return row.isExpanded ? 32 + row.items.length * 96 : 32
  }
  return 96
}
