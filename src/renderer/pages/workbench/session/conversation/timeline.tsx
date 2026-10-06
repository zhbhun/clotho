import { Brain, ChevronDown, ChevronRight, FileSearch, FileText } from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { cn } from '@/shadcn/utils'

import { MarkdownRenderer } from '../../../../components/markdown-renderer'
import type { ClaudeToolRequest, ClaudeToolResult } from '../../../../services/claude/claude'
import { AttachmentList } from '../components/attachment-list'
import type { ClaudeMessage } from '../services/message'
import { ToolItem } from '../tools/tool-item'
import { UserMessageActions } from './message-actions'
import { TaskCardRow } from './timeline-work-items'
import { type TurnTerminalStatus, isTimelineToolRunning } from './tool-state'
import type { ConversationTimelineItem } from './types'

type PendingToolRequests = Record<string, ClaudeToolRequest>
type ToolResponder = (toolUseId: string, result: ClaudeToolResult) => Promise<void>
const USER_CARD_COLLAPSED_HEIGHT = 450
const USER_CARD_VERTICAL_PADDING = 24

interface AttachmentChip {
  kind: 'file' | 'selection'
  text: string
}

function extractAttachments(content: string): { chips: AttachmentChip[]; cleaned: string } {
  const chips: AttachmentChip[] = []
  let cleaned = content

  cleaned = cleaned.replace(/<ide_opened_file[^>]*>([\s\S]*?)<\/ide_opened_file>/g, (_m, inner) => {
    chips.push({ kind: 'file', text: String(inner).trim() })
    return ''
  })
  cleaned = cleaned.replace(/<ide_selection[^>]*>([\s\S]*?)<\/ide_selection>/g, (_m, inner) => {
    chips.push({ kind: 'selection', text: String(inner).trim().slice(0, 80) })
    return ''
  })

  return { chips, cleaned: cleaned.trim() }
}

export function UserCard({
  className,
  editor,
  message,
  onEdit,
}: {
  className?: string
  editor?: ReactNode
  message: ClaudeMessage
  onEdit?: () => void
}) {
  const { t } = useTranslation()
  const { chips, cleaned } = extractAttachments(message.content)
  const showCommand = message.isCommand && message.commandName
  const contentRef = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const isEditing = editor != null

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return

    const measure = () => {
      setHasOverflow(content.scrollHeight + USER_CARD_VERTICAL_PADDING > USER_CARD_COLLAPSED_HEIGHT)
    }

    measure()

    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => measure())
    observer?.observe(content)

    return () => {
      observer?.disconnect()
    }
  }, [isEditing, message.content, message.attachments])

  return (
    <article className={cn('flex w-full justify-end bg-background pt-10', className)}>
      {editor ?? (
        <div className="group/user-message min-w-16 max-w-[75%]">
          <div
            className="relative overflow-hidden rounded-[16px] rounded-br-none border border-border/60 bg-muted"
            data-slot="user-message-card"
          >
            <div className={cn('overflow-hidden', !isExpanded && 'max-h-[450px]')}>
              <div className={cn('select-text p-3 leading-6', hasOverflow && 'pb-9')}>
                <div ref={contentRef}>
                  {message.attachments?.length ? (
                    <AttachmentList
                      attachments={message.attachments}
                      className={cleaned ? 'mb-1.5' : undefined}
                      isEmbedded
                    />
                  ) : null}
                  {chips.length > 0 ? (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {chips.map((chip, i) => (
                        <span
                          key={i}
                          className="inline-flex max-w-[80%] items-center gap-1.5 rounded-md bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_8%)] px-1.5 py-0.5 leading-5 text-foreground"
                        >
                          {chip.kind === 'selection' ? (
                            <FileSearch className="size-3" />
                          ) : (
                            <FileText className="size-3" />
                          )}
                          <span className="truncate">{chip.text}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {showCommand ? (
                    <p className="whitespace-pre-wrap wrap-break-word leading-6">
                      <span className="mx-0.5 inline-flex h-5 items-center rounded-md bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_8%)] px-1.5 leading-5 text-foreground">
                        /{message.commandName}
                      </span>
                      {message.commandArgs ? (
                        <span className="ml-1">{message.commandArgs}</span>
                      ) : null}
                    </p>
                  ) : cleaned.trim() ? (
                    <p className="whitespace-pre-wrap wrap-break-word">{cleaned}</p>
                  ) : null}
                </div>
              </div>
            </div>

            {hasOverflow && !isExpanded ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-muted to-transparent" />
            ) : null}

            {hasOverflow ? (
              <Button
                aria-expanded={isExpanded}
                aria-label={
                  isExpanded
                    ? t('workbench.conversation.collapseUserMessage')
                    : t('workbench.conversation.expandUserMessage')
                }
                className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full"
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => setIsExpanded((current) => !current)}
              >
                <ChevronDown
                  className={cn('transition-transform', isExpanded && 'rotate-180')}
                  data-icon
                />
              </Button>
            ) : null}
          </div>

          <UserMessageActions
            text={message.content}
            timestamp={message.timestamp}
            onEdit={onEdit}
          />
        </div>
      )}
    </article>
  )
}

export function TimelineRow({
  children,
  compactAfter = false,
  isLast,
}: {
  children: ReactNode
  compactAfter?: boolean
  isLast?: boolean
}) {
  return (
    <div
      className={cn(
        'min-w-0',
        isLast === undefined && 'last:pb-0',
        isLast ? 'pb-0' : compactAfter ? 'pb-1.5' : 'pb-3',
      )}
    >
      {children}
    </div>
  )
}

/** Shared timeline renderer for the main conversation and subagent dialog (dots, Thinking, and tool cards). */
export function TimelineEntry({
  compactAfter = false,
  isLast,
  isStreaming,
  item,
  onOpenSubagent,
  pendingRequests,
  projectPath,
  turnTerminalStatus,
  onRespond,
}: {
  compactAfter?: boolean
  isLast: boolean
  isStreaming?: boolean
  item: ConversationTimelineItem
  onOpenSubagent?: (toolUseId: string) => void
  pendingRequests?: PendingToolRequests
  projectPath?: string
  turnTerminalStatus?: TurnTerminalStatus
  onRespond?: ToolResponder
}) {
  const pendingRequest =
    item.kind === 'tool' ? toolPendingRequest(pendingRequests, item.use?.toolUseId) : undefined

  return (
    <TimelineRow compactAfter={compactAfter} isLast={isLast}>
      {item.kind === 'thinking' ? (
        <ThinkingBlock isRunning={Boolean(isStreaming && isLast)} text={item.text} />
      ) : item.kind === 'task' ? (
        <TaskCardRow tasks={item.tasks} />
      ) : item.kind === 'tool' ? (
        <ToolItem
          backgroundTask={item.backgroundTask}
          coalescedReads={item.coalescedReads}
          taskItems={item.taskItems}
          images={item.result?.images}
          input={item.use?.input}
          isError={item.isError}
          isRunning={isTimelineToolRunning(item, {
            isStreaming: Boolean(isStreaming),
            pendingRequest,
            turnTerminalStatus,
          })}
          name={item.use?.name}
          onOpenSubagent={onOpenSubagent}
          pendingRequest={pendingRequest}
          projectPath={projectPath}
          onRespond={bindToolResponder(onRespond, item.use?.toolUseId)}
          result={item.result?.content}
          toolUseId={item.use?.toolUseId}
          toolUseResult={item.result?.toolUseResult}
        />
      ) : item.kind === 'text' ? (
        <div className="assistant-summary min-w-0 leading-6 text-foreground">
          <MarkdownRenderer content={item.text} isStreaming={isStreaming} />
        </div>
      ) : null}
    </TimelineRow>
  )
}

export function TimelineItems({
  items,
  isStreaming,
  onOpenSubagent,
  pendingRequests,
  projectPath,
  onRespond,
}: {
  items: ConversationTimelineItem[]
  isStreaming?: boolean
  onOpenSubagent?: (toolUseId: string) => void
  pendingRequests?: PendingToolRequests
  projectPath?: string
  onRespond?: ToolResponder
}) {
  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const nextItem = items[index + 1]

        return (
          <TimelineEntry
            isLast={index === items.length - 1}
            isStreaming={isStreaming}
            item={item}
            key={item.id}
            compactAfter={Boolean(item.kind !== 'text' && nextItem && nextItem.kind !== 'text')}
            onOpenSubagent={onOpenSubagent}
            pendingRequests={pendingRequests}
            projectPath={projectPath}
            onRespond={onRespond}
          />
        )
      })}
    </div>
  )
}

function toolPendingRequest(
  pendingRequests: PendingToolRequests | undefined,
  toolUseId: string | undefined,
): ClaudeToolRequest | undefined {
  if (!toolUseId || !pendingRequests) return undefined
  return pendingRequests[toolUseId]
}

function bindToolResponder(
  onRespond: ToolResponder | undefined,
  toolUseId: string | undefined,
): ((result: ClaudeToolResult) => Promise<void>) | undefined {
  if (!onRespond || !toolUseId) return undefined
  return (result) => onRespond(toolUseId, result)
}

function ThinkingBlock({ isRunning = false, text }: { isRunning?: boolean; text: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  if (!text.trim()) return null
  const tokens = Math.max(1, Math.round(text.length / 4))
  const toggleOpen = () => setOpen((value) => !value)
  const handleToggleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    toggleOpen()
  }

  return (
    <div className="min-w-0">
      <div
        aria-expanded={open}
        aria-label={t('workbench.timeline.thoughtTokens', { count: tokens })}
        className="group -mx-1 inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-sm px-1 text-left leading-6 text-foreground-subtle outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
        role="button"
        tabIndex={0}
        onClick={toggleOpen}
        onKeyDown={handleToggleKeyDown}
      >
        <span className={cn('inline-flex shrink-0', isRunning && 'motion-safe:animate-pulse')}>
          <Brain
            aria-hidden
            className="size-3.5 text-foreground-subtlest transition-colors group-hover:text-foreground"
          />
        </span>
        <span className="text-foreground-subtlest transition-colors group-hover:text-foreground">
          {t('workbench.timeline.tokenCount', { count: tokens })}
        </span>
        <ChevronRight
          className={cn(
            'size-3.5 shrink-0 text-foreground-subtlest opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100',
            open && 'rotate-90 opacity-100',
          )}
        />
      </div>
      {open ? (
        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground-subtlest">{text}</p>
      ) : null}
    </div>
  )
}
