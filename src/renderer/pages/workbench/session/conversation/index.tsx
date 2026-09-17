import { ChevronRight, type LucideIcon } from 'lucide-react'
import { type Ref, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { MarkdownRenderer } from '../../../../components/markdown-renderer'
import { ShinyText } from '../../../../components/shiny-text'
import type { ClaudeToolRequest, ClaudeToolResult } from '../../../../services/claude/claude'
import type { ClaudeMessage } from '../services/message'
import type { TurnFailure } from '../session-types'
import { AgentReplyErrorBoundary } from './agent-reply-error-boundary'
import {
  type ConversationRow,
  buildConversationRows,
  formatConversationDuration,
} from './conversation-rows'
import { HistoricalMessageEditor, type MessageEditConfig } from './historical-message-editor'
import { AgentMessageActions } from './message-actions'
import { TimelineEntry, TimelineRow, UserCard } from './timeline'
import { computeLastSentTurnId, computeTurns } from './turns'
import type { ConversationTurn } from './types'
import { type VirtualConversationHandle, VirtualConversationList } from './virtual-conversation'

const EMPTY_INTERRUPTED_TURN_IDS = new Set<string>()

export function ConversationState({
  icon: Icon,
  label,
  spin = false,
}: {
  icon: LucideIcon
  label: string
  spin?: boolean
}) {
  return (
    <div className="flex flex-1 items-center justify-center py-24 text-foreground-subtle">
      <div className="flex items-center gap-2 [&_svg]:size-4">
        <Icon className={cn(spin && 'animate-spin')} />
        <span>{label}</span>
      </div>
    </div>
  )
}

type ConversationViewProps = {
  expandedTurns: Record<string, boolean>
  interruptedTurnIds?: Set<string>
  interruptedTurnDurations?: Record<string, number>
  isStreaming: boolean
  messageEdit?: MessageEditConfig
  messages: ClaudeMessage[]
  onFork?: (messageUuid: string) => Promise<void>
  onOpenSubagent?: (toolUseId: string) => void
  onRespond: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
  onTotalSizeChange?: (size: number) => void
  onToggle: (turnId: string) => void
  onVisibleTurnIdsChange?: (ids: Set<string>) => void
  pendingRequests: Record<string, ClaudeToolRequest>
  projectPath?: string
  sentTurnIds: Set<string>
  streamingElapsed: number
  turnFailures?: Record<string, TurnFailure>
  turns?: ConversationTurn[]
  viewport?: HTMLDivElement | null
  viewKey?: string
  virtualListRef?: Ref<VirtualConversationHandle>
}

export function ConversationView({
  expandedTurns,
  interruptedTurnIds = EMPTY_INTERRUPTED_TURN_IDS,
  interruptedTurnDurations,
  isStreaming,
  messageEdit,
  messages,
  onFork,
  onOpenSubagent,
  onRespond,
  onTotalSizeChange,
  onToggle,
  onVisibleTurnIdsChange,
  pendingRequests,
  projectPath,
  sentTurnIds,
  streamingElapsed,
  turnFailures,
  turns: suppliedTurns,
  viewport,
  viewKey = 'root',
  virtualListRef,
}: ConversationViewProps) {
  const { t } = useTranslation()
  const [editingMessageId, setEditingMessageId] = useState<string>()
  const turns = useMemo(() => suppliedTurns ?? computeTurns(messages), [messages, suppliedTurns])
  const lastSentTurnId = useMemo(
    () => computeLastSentTurnId(turns, sentTurnIds),
    [turns, sentTurnIds],
  )
  const visibleEditingMessageId = isStreaming ? undefined : editingMessageId
  const rows = useMemo(
    () =>
      buildConversationRows({
        expandedTurns,
        formatDuration: (seconds) => formatConversationDuration(seconds, t),
        interruptedTurnIds,
        interruptedTurnDurations,
        isStreaming,
        lastSentTurnId,
        pendingRequests,
        streamingElapsed,
        turnFailures,
        turns,
      }),
    [
      expandedTurns,
      interruptedTurnIds,
      interruptedTurnDurations,
      isStreaming,
      lastSentTurnId,
      pendingRequests,
      streamingElapsed,
      t,
      turnFailures,
      turns,
    ],
  )
  const firstAssistantKeys = useMemo(() => {
    const keys = new Set<string>()
    rows.forEach((row, index) => {
      const previous = rows[index - 1]
      if (row.kind !== 'user' && previous?.kind === 'user' && previous.turnId === row.turnId) {
        keys.add(row.key)
      }
    })
    return keys
  }, [rows])

  useEffect(() => {
    if (isStreaming) setEditingMessageId(undefined)
  }, [isStreaming])

  const renderRow = useCallback(
    (row: ConversationRow) => {
      const content = (
        <ConversationRowContent
          hasTopPadding={firstAssistantKeys.has(row.key)}
          isMessageEditing={row.kind === 'user' && visibleEditingMessageId === row.message.id}
          messageEdit={messageEdit}
          pendingRequests={pendingRequests}
          projectPath={projectPath}
          row={row}
          onCancelEdit={() => setEditingMessageId(undefined)}
          onEditMessage={
            row.kind === 'user' &&
            !editingMessageId &&
            !isStreaming &&
            messageEdit &&
            row.message.uuid
              ? () => setEditingMessageId(row.message.id)
              : undefined
          }
          onFork={onFork}
          onOpenSubagent={onOpenSubagent}
          onRespond={onRespond}
          onToggle={onToggle}
        />
      )

      return row.kind === 'user' ? (
        content
      ) : (
        <AgentReplyErrorBoundary fallback={t('workbench.conversation.renderFailed')}>
          {content}
        </AgentReplyErrorBoundary>
      )
    },
    [
      editingMessageId,
      firstAssistantKeys,
      isStreaming,
      messageEdit,
      onFork,
      onOpenSubagent,
      onRespond,
      onToggle,
      pendingRequests,
      projectPath,
      t,
      visibleEditingMessageId,
    ],
  )

  if (!rows.length) return null

  if (viewport === undefined) {
    return (
      <div className="flex flex-col">
        {rows.map((row) => (
          <div key={row.key}>{renderRow(row)}</div>
        ))}
      </div>
    )
  }

  return (
    <VirtualConversationList
      estimateSize={estimateConversationRowSize}
      ref={virtualListRef}
      renderRow={renderRow}
      rows={rows}
      viewport={viewport}
      viewKey={viewKey}
      onTotalSizeChange={onTotalSizeChange}
      onVisibleTurnIdsChange={onVisibleTurnIdsChange}
    />
  )
}

function estimateConversationRowSize(row: ConversationRow) {
  if (row.kind === 'user') return 120
  if (row.kind === 'status') return 48
  if (row.kind === 'actions') return 32
  if (row.kind === 'thinking') return 48
  return 120
}

function ConversationRowContent({
  hasTopPadding,
  isMessageEditing,
  messageEdit,
  onCancelEdit,
  onEditMessage,
  onFork,
  onOpenSubagent,
  onRespond,
  onToggle,
  pendingRequests,
  projectPath,
  row,
}: {
  hasTopPadding: boolean
  isMessageEditing: boolean
  messageEdit?: MessageEditConfig
  onCancelEdit: () => void
  onEditMessage?: () => void
  onFork?: (messageUuid: string) => Promise<void>
  onOpenSubagent?: (toolUseId: string) => void
  onRespond: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
  onToggle: (turnId: string) => void
  pendingRequests: Record<string, ClaudeToolRequest>
  projectPath?: string
  row: ConversationRow
}) {
  const { t } = useTranslation()
  if (row.kind === 'user') {
    return (
      <div data-conversation-turn-id={row.turnId}>
        <UserCard
          editor={
            isMessageEditing && messageEdit ? (
              <HistoricalMessageEditor
                config={messageEdit}
                message={row.message}
                onCancel={onCancelEdit}
              />
            ) : undefined
          }
          message={row.message}
          onEdit={onEditMessage}
        />
      </div>
    )
  }

  if (row.kind === 'status') {
    const statusLabel =
      row.status === 'interrupted'
        ? row.duration
          ? t('workbench.conversation.stoppedAfter', { duration: row.duration })
          : t('workbench.conversation.stopped')
        : row.status === 'failed'
          ? row.duration
            ? t('workbench.conversation.failedAfter', { duration: row.duration })
            : t('workbench.conversation.failed')
          : row.status === 'completed'
            ? t('workbench.conversation.worked')
            : t('workbench.conversation.processing')

    const statusContent = (
      <span className="min-w-0">
        <span className="block">{statusLabel}</span>
        {row.error ? (
          <span className="block whitespace-pre-wrap wrap-break-word text-destructive">
            {row.error}
          </span>
        ) : null}
      </span>
    )

    return (
      <div className={cn('px-3', hasTopPadding && 'pt-2')}>
        <TimelineRow isLast={row.isLast}>
          {row.canToggle ? (
            <button
              aria-expanded={row.isExpanded}
              className="group inline-flex min-w-0 items-center gap-1.5 text-left leading-6 text-foreground-subtle transition-colors hover:text-foreground"
              type="button"
              onClick={() => onToggle(row.turnId)}
            >
              <span className="min-w-0 text-foreground-subtlest">{statusContent}</span>
              <ChevronRight
                className={cn(
                  'size-3.5 shrink-0 text-foreground-subtlest transition-transform',
                  row.isExpanded && 'rotate-90',
                )}
              />
            </button>
          ) : (
            <span className="inline-flex min-w-0 items-center leading-6 text-foreground-subtlest">
              {statusContent}
            </span>
          )}
        </TimelineRow>
      </div>
    )
  }

  if (row.kind === 'timeline') {
    return (
      <div className={cn('px-3', hasTopPadding && 'pt-2')}>
        <TimelineEntry
          compactAfter={row.compactAfter}
          isLast={row.isLast}
          isStreaming={row.isStreaming}
          item={row.item}
          onOpenSubagent={onOpenSubagent}
          pendingRequests={pendingRequests}
          projectPath={projectPath}
          turnTerminalStatus={row.turnTerminalStatus}
          onRespond={onRespond}
        />
      </div>
    )
  }

  if (row.kind === 'text') {
    return (
      <div className={cn('px-3 pb-1', hasTopPadding && 'pt-2')}>
        <MarkdownRenderer content={row.item.text} isStreaming={row.isStreaming} />
      </div>
    )
  }

  if (row.kind === 'actions') {
    return (
      <div className={cn('px-3', row.hasTopGap && 'pt-1')}>
        <AgentMessageActions
          messageUuid={row.messageUuid}
          onFork={onFork}
          text={row.text}
          timestamp={row.timestamp}
        />
      </div>
    )
  }

  return row.placement === 'timeline' ? (
    <div className={cn('px-3', hasTopPadding && 'pt-2')}>
      <TimelineRow isLast>
        <div aria-live="polite" className="leading-6">
          <ShinyText text={t('workbench.conversation.thinking')} />
        </div>
      </TimelineRow>
    </div>
  ) : (
    <div className="px-3 pt-4 leading-6" aria-live="polite">
      <ShinyText text={t('workbench.conversation.thinking')} />
    </div>
  )
}
