import { Brain, ChevronDown, ChevronRight, FileSearch, FileText } from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { cn } from '@/shadcn/utils'

import { MarkdownRenderer } from '../../../../components/markdown-renderer'
import { ShinyText } from '../../../../components/shiny-text'
import type { ClaudeToolRequest, ClaudeToolResult } from '../../../../services/claude/claude'
import {
  type TodoItem,
  extractTodoItems,
  isTodoWriteToolName,
} from '../../../../services/claude/todo'
import { AttachmentList } from '../components/attachment-list'
import type { ClaudeContentBlock, ClaudeMessage } from '../services/message'
import { ToolItem } from '../tools/tool-item'
import { UserMessageActions } from './message-actions'
import { TaskSummary, TodoSummary } from './timeline-work-items'
import { type TurnTerminalStatus, isTimelineToolRunning } from './tool-state'
import type { ClaudeTaskItem, ConversationTimelineItem } from './types'

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
                    />
                  ) : null}
                  {chips.length > 0 ? (
                    <div className="mb-1.5 flex flex-wrap gap-1">
                      {chips.map((chip, i) => (
                        <span
                          key={i}
                          className="inline-flex max-w-[80%] items-center gap-1.5 rounded-md border border-border/60 bg-muted px-1.5 py-0.5 leading-5 text-foreground"
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

export function AssistantWork({
  blocks,
  duration,
  isExpanded,
  isStreaming,
  isInterrupted = false,
  items,
  projectPath,
  summary,
  onToggle,
  onOpenSubagent,
  pendingRequests,
  onRespond,
}: {
  blocks: ClaudeContentBlock[]
  duration?: string
  isExpanded: boolean
  isStreaming: boolean
  isInterrupted?: boolean
  items?: ConversationTimelineItem[]
  projectPath?: string
  summary?: ReactNode
  onToggle: () => void
  onOpenSubagent?: (toolUseId: string) => void
  pendingRequests?: PendingToolRequests
  onRespond?: ToolResponder
}) {
  const { t } = useTranslation()
  const timelineItems = useMemo(
    () => items ?? buildTimelineItemsFromBlocks(blocks),
    [blocks, items],
  )
  const lastTextIndex = timelineItems.findLastIndex((item) => item.kind === 'text')
  const hasWorkAfterLastText =
    lastTextIndex >= 0 &&
    timelineItems.slice(lastTextIndex + 1).some((item) => item.kind !== 'text')
  const trailingStartIndex = hasWorkAfterLastText ? lastTextIndex : timelineItems.length
  const fallbackCollapsedSummary = useMemo(() => {
    const lastTextItem = [...timelineItems].reverse().find((item) => item.kind === 'text')
    if (!lastTextItem) return null

    return <MarkdownRenderer content={lastTextItem.text} isStreaming={isStreaming} />
  }, [isStreaming, timelineItems])
  const visibleItems = isExpanded ? timelineItems : timelineItems.slice(trailingStartIndex)
  const renderedSummary = isExpanded
    ? summary
    : hasWorkAfterLastText
      ? summary
      : (summary ?? fallbackCollapsedSummary)
  const latestItem = timelineItems.at(-1)
  const latestPendingRequest =
    latestItem?.kind === 'tool'
      ? toolPendingRequest(pendingRequests, latestItem.use?.toolUseId)
      : undefined
  const showThinkingAfterLatestTool = Boolean(
    (isExpanded || hasWorkAfterLastText) &&
    isStreaming &&
    latestItem?.kind === 'tool' &&
    !latestPendingRequest &&
    !isTimelineToolRunning(latestItem, {
      isStreaming,
      pendingRequest: latestPendingRequest,
      turnTerminalStatus: isInterrupted ? 'interrupted' : undefined,
    }),
  )
  const statusLabel = isInterrupted
    ? duration
      ? t('workbench.conversation.stoppedAfter', { duration })
      : t('workbench.conversation.stopped')
    : t('workbench.conversation.processing')

  return (
    <div className="flex flex-col">
      <TimelineRow>
        {timelineItems.length > 0 ? (
          <button
            aria-expanded={isExpanded}
            className="group inline-flex min-w-0 items-center gap-1.5 text-left leading-6 text-foreground-subtle transition-colors hover:text-foreground"
            type="button"
            onClick={onToggle}
          >
            <span className="truncate text-foreground-subtlest">{statusLabel}</span>
            <ChevronRight
              className={cn(
                'size-3.5 shrink-0 text-foreground-subtlest transition-transform',
                isExpanded && 'rotate-90',
              )}
            />
          </button>
        ) : (
          <span className="inline-flex min-w-0 items-center leading-6 text-foreground-subtlest">
            {statusLabel}
          </span>
        )}
      </TimelineRow>

      {visibleItems.map((item, index) => {
        const pendingRequest =
          item.kind === 'tool'
            ? toolPendingRequest(pendingRequests, item.use?.toolUseId)
            : undefined
        const nextItem = visibleItems[index + 1]

        return (
          <TimelineRow
            key={item.id}
            compactAfter={
              item.kind !== 'text' &&
              (nextItem ? nextItem.kind !== 'text' : showThinkingAfterLatestTool)
            }
          >
            {item.kind === 'thinking' ? (
              <ThinkingBlock
                isRunning={isStreaming && index === visibleItems.length - 1}
                text={item.text}
              />
            ) : item.kind === 'todo' ? (
              <TodoSummary todos={item.todos} />
            ) : item.kind === 'task' ? (
              <TaskSummary tasks={item.tasks} />
            ) : item.kind === 'tool' ? (
              <ToolItem
                backgroundTask={item.backgroundTask}
                coalescedReads={item.coalescedReads}
                images={item.result?.images}
                input={item.use?.input}
                isError={item.isError}
                isRunning={isTimelineToolRunning(item, {
                  isStreaming,
                  pendingRequest,
                  turnTerminalStatus: isInterrupted ? 'interrupted' : undefined,
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
      })}

      {showThinkingAfterLatestTool ? (
        <TimelineRow>
          <div aria-live="polite" className="leading-6">
            <ShinyText text={t('workbench.conversation.thinking')} />
          </div>
        </TimelineRow>
      ) : null}

      {renderedSummary ? (
        <TimelineRow>
          <div className="assistant-summary min-w-0 leading-6 text-foreground">
            {renderedSummary}
          </div>
        </TimelineRow>
      ) : null}
    </div>
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

type WorkSegment =
  | { kind: 'thinking'; text: string }
  | { kind: 'todo'; todos: TodoItem[]; toolUseId?: string; resultText?: string }
  | { kind: 'task'; tasks: ClaudeTaskItem[] }
  | { kind: 'tool'; use?: ClaudeContentBlock; result?: ClaudeContentBlock }

function pairTodoSegmentResult(segments: WorkSegment[], block: ClaudeContentBlock): boolean {
  const target = segments.findLast(
    (segment) => segment.kind === 'todo' && segment.resultText === undefined,
  )
  if (!target || target.kind !== 'todo') return false
  target.resultText = block.content
  return true
}

type TaskToolKind = 'create' | 'update'

function taskToolKind(name?: string): TaskToolKind | null {
  const normalized = name?.replace(/Tool$/, '').toLowerCase()
  if (normalized === 'taskcreate' || normalized === 'task_create') return 'create'
  if (normalized === 'taskupdate' || normalized === 'task_update') return 'update'
  return null
}

function taskInputString(input: unknown, keys: string[]): string {
  const obj = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function taskInputStatus(input: unknown): ClaudeTaskItem['status'] | null {
  const status = taskInputString(input, ['status'])
  if (status === 'pending' || status === 'in_progress' || status === 'completed') return status
  return null
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function nestedString(value: unknown, keys: string[]): string {
  let current: unknown = value
  for (const key of keys) {
    current = objectRecord(current)[key]
  }
  return typeof current === 'string' || typeof current === 'number' ? String(current) : ''
}

function taskIdFromCreateToolUseResult(result?: ClaudeContentBlock): string {
  return nestedString(result?.toolUseResult, ['task', 'id'])
}

function taskSubjectFromCreateToolUseResult(result?: ClaudeContentBlock): string {
  return nestedString(result?.toolUseResult, ['task', 'subject'])
}

function taskIdFromUpdateToolUseResult(result?: ClaudeContentBlock): string {
  return nestedString(result?.toolUseResult, ['taskId'])
}

function taskStatusFromUpdateToolUseResult(
  result?: ClaudeContentBlock,
): ClaudeTaskItem['status'] | null {
  const status = nestedString(result?.toolUseResult, ['statusChange', 'to'])
  if (status === 'pending' || status === 'in_progress' || status === 'completed') return status
  return null
}

function taskIdFromCreateResult(result?: ClaudeContentBlock): string {
  const match = result?.content?.match(/\bTask\s+#([^\s:]+)\s+created successfully\b/i)
  return match?.[1] ?? ''
}

function cloneTaskItems(tasks: Map<string, ClaudeTaskItem>): ClaudeTaskItem[] {
  return Array.from(tasks.values()).map((task) => ({ ...task }))
}

function normalizeTaskSegments(segments: WorkSegment[]): WorkSegment[] {
  const normalized: WorkSegment[] = []
  const tasks = new Map<string, ClaudeTaskItem>()
  let currentTaskSegment: Extract<WorkSegment, { kind: 'task' }> | null = null

  for (const segment of segments) {
    if (segment.kind !== 'tool') {
      normalized.push(segment)
      currentTaskSegment = null
      continue
    }

    const kind = taskToolKind(segment.use?.name)
    let isAbsorbed = false

    if (kind === 'create') {
      const id =
        taskIdFromCreateToolUseResult(segment.result) || taskIdFromCreateResult(segment.result)
      const subject =
        taskSubjectFromCreateToolUseResult(segment.result) ||
        taskInputString(segment.use?.input, ['subject'])
      if (id && subject) {
        tasks.set(id, {
          id,
          subject,
          description: taskInputString(segment.use?.input, ['description']) || undefined,
          activeForm:
            taskInputString(segment.use?.input, ['activeForm', 'active_form']) || undefined,
          status: 'pending',
        })
        isAbsorbed = true
      }
    } else if (kind) {
      const id =
        taskIdFromUpdateToolUseResult(segment.result) ||
        taskInputString(segment.use?.input, ['taskId', 'task_id', 'id'])
      const existing = id ? tasks.get(id) : undefined
      if (existing) {
        if (kind === 'update') {
          const status =
            taskStatusFromUpdateToolUseResult(segment.result) || taskInputStatus(segment.use?.input)
          if (status) existing.status = status
          const activeForm = taskInputString(segment.use?.input, ['activeForm', 'active_form'])
          if (activeForm) existing.activeForm = activeForm
        }
        isAbsorbed = true
      }
    }

    if (!isAbsorbed) {
      normalized.push(segment)
      currentTaskSegment = null
      continue
    }

    if (!currentTaskSegment) {
      currentTaskSegment = { kind: 'task', tasks: cloneTaskItems(tasks) }
      normalized.push(currentTaskSegment)
    } else {
      currentTaskSegment.tasks = cloneTaskItems(tasks)
    }
  }

  return normalized
}

function buildWorkSegments(blocks: ClaudeContentBlock[]): WorkSegment[] {
  const segments: WorkSegment[] = []
  let ignoredTodoResults = 0
  for (const block of blocks) {
    if (block.type === 'thinking') {
      segments.push({ kind: 'thinking', text: block.text ?? '' })
    } else if (block.type === 'tool_use') {
      if (isTodoWriteToolName(block.name)) {
        const todos = extractTodoItems(block.input)
        if (todos.length) {
          segments.push({ kind: 'todo', todos, toolUseId: block.toolUseId, resultText: undefined })
        }
        ignoredTodoResults += 1
        continue
      }

      const segment: WorkSegment = { kind: 'tool', use: block }
      segments.push(segment)
    } else if (block.type === 'tool_result') {
      if (ignoredTodoResults > 0) {
        ignoredTodoResults -= 1
        pairTodoSegmentResult(segments, block)
        continue
      }

      const target = segments.findLast((s) => s.kind === 'tool' && !s.result)
      if (target && target.kind === 'tool') {
        target.result = block
      } else {
        segments.push({ kind: 'tool', result: block })
      }
    }
  }
  return normalizeTaskSegments(segments)
}

function buildTimelineItemsFromBlocks(blocks: ClaudeContentBlock[]): ConversationTimelineItem[] {
  return buildWorkSegments(blocks).map((segment, index) => {
    if (segment.kind === 'thinking') {
      return {
        id: `thinking-${index}`,
        kind: 'thinking',
        text: segment.text,
      }
    }

    if (segment.kind === 'todo') {
      return {
        id: `todo-${index}`,
        kind: 'todo',
        todos: segment.todos,
        toolUseId: segment.toolUseId,
        resultText: segment.resultText,
      }
    }

    if (segment.kind === 'task') {
      return {
        id: `task-${index}`,
        kind: 'task',
        tasks: segment.tasks,
      }
    }

    return {
      id: `tool-${index}`,
      kind: 'tool',
      use: segment.use,
      result: segment.result,
      isError: segment.result?.isError,
    }
  })
}

/** Shared timeline renderer for the main conversation and subagent dialog (dots, Thinking, and tool cards). */
export function TimelineEntry({
  compactAfter = false,
  defaultToolOpen,
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
  defaultToolOpen?: boolean
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
      ) : item.kind === 'todo' ? (
        <TodoSummary todos={item.todos} />
      ) : item.kind === 'task' ? (
        <TaskSummary tasks={item.tasks} />
      ) : item.kind === 'tool' ? (
        <ToolItem
          backgroundTask={item.backgroundTask}
          coalescedReads={item.coalescedReads}
          defaultOpen={defaultToolOpen}
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
