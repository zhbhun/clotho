import { Check, Copy, GitBranchPlus, LoaderCircle, Pencil } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { cn } from '@/shadcn/utils'

const COPY_FEEDBACK_MS = 3_000

export function formatMessageTime(timestamp?: string) {
  if (!timestamp) return ''

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''

  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function ActionRow({
  children,
  className,
  contentClassName,
  isTimeTrailing = false,
  timestamp,
}: {
  children: ReactNode
  className?: string
  contentClassName?: string
  isTimeTrailing?: boolean
  timestamp?: string
}) {
  const formattedTime = formatMessageTime(timestamp)
  const time = formattedTime ? (
    <span className={cn('tabular-nums', isTimeTrailing ? 'ml-1' : 'mr-1')}>{formattedTime}</span>
  ) : null

  return (
    <div className={cn('flex min-h-6 items-center text-xs text-foreground-subtlest', className)}>
      <div className={cn('flex items-center gap-0.5', contentClassName)}>
        {!isTimeTrailing ? time : null}
        {children}
        {isTimeTrailing ? time : null}
      </div>
    </div>
  )
}

function CopyAction({
  copiedLabel,
  label,
  text,
}: {
  copiedLabel: string
  label: string
  text: string
}) {
  const [isCopied, setIsCopied] = useState(false)
  const resetTimerRef = useRef<number | undefined>(undefined)

  useEffect(
    () => () => {
      if (resetTimerRef.current !== undefined) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }

    setIsCopied(true)
    if (resetTimerRef.current !== undefined) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => {
      setIsCopied(false)
      resetTimerRef.current = undefined
    }, COPY_FEEDBACK_MS)
  }

  return (
    <Button
      aria-label={isCopied ? copiedLabel : label}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={handleCopy}
    >
      {isCopied ? <Check data-icon /> : <Copy data-icon />}
    </Button>
  )
}

export function AgentMessageActions({
  messageUuid,
  onFork,
  text,
  timestamp,
}: {
  messageUuid?: string
  onFork?: (messageUuid: string) => Promise<void>
  text: string
  timestamp?: string
}) {
  const { t } = useTranslation()
  const [isForking, setIsForking] = useState(false)
  const canFork = Boolean(messageUuid && onFork) && !isForking

  async function handleFork() {
    if (!messageUuid || !onFork || isForking) return

    setIsForking(true)
    try {
      await onFork(messageUuid)
    } finally {
      setIsForking(false)
    }
  }

  return (
    <ActionRow className="mt-1 justify-start" isTimeTrailing timestamp={timestamp}>
      <CopyAction
        copiedLabel={t('workbench.conversation.agentReplyCopied')}
        label={t('workbench.conversation.copyAgentReply')}
        text={text}
      />
      <Button
        aria-label={t('workbench.conversation.forkReply')}
        disabled={!canFork}
        size="icon-sm"
        type="button"
        variant="ghost"
        onClick={handleFork}
      >
        {isForking ? (
          <LoaderCircle className="animate-spin" data-icon />
        ) : (
          <GitBranchPlus data-icon />
        )}
      </Button>
    </ActionRow>
  )
}

export function UserMessageActions({
  onEdit,
  text,
  timestamp,
}: {
  onEdit?: () => void
  text: string
  timestamp?: string
}) {
  const { t } = useTranslation()
  return (
    <ActionRow
      className="relative ml-auto h-8 w-0"
      contentClassName="absolute top-1 right-0 hidden group-hover/user-message:flex"
      timestamp={timestamp}
    >
      <CopyAction
        copiedLabel={t('workbench.conversation.userMessageCopied')}
        label={t('workbench.conversation.copyUserMessage')}
        text={text}
      />
      {onEdit ? (
        <Button
          aria-label={t('workbench.conversation.editUserMessage')}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onEdit}
        >
          <Pencil data-icon />
        </Button>
      ) : null}
    </ActionRow>
  )
}
