import { CornerDownRight, FileText, ImageIcon, Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { cn } from '@/shadcn/utils'
import type { ClaudeAttachment } from '@/shared/rpc'

import type { PendingMessage } from '../stores/composer-store'

const IMAGE_PATH_PATTERN = /\.(png|jpe?g|gif|webp)$/i

function isImageAttachment(attachment: ClaudeAttachment) {
  if (attachment.content) {
    return (
      attachment.content.type === 'image' ||
      Boolean(
        attachment.content.source.path && IMAGE_PATH_PATTERN.test(attachment.content.source.path),
      )
    )
  }
  return Boolean(attachment.path && IMAGE_PATH_PATTERN.test(attachment.path))
}

function PendingImageThumb({ attachment }: { attachment: ClaudeAttachment }) {
  const [failed, setFailed] = useState(false)
  const source =
    attachment.content?.type === 'image'
      ? `data:${attachment.content.source.media_type};base64,${attachment.content.source.data}`
      : undefined
  if (!source || failed) return <ImageIcon className="size-4 shrink-0" strokeWidth={1} />
  return (
    <img
      alt={attachment.name}
      className="size-6 shrink-0 rounded-md object-cover"
      src={source}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * The message queued behind the running turn, shown above the composer card:
 * a rounded-top strip that sinks behind the card like the empty-state project
 * switcher. Icon + text on the left (or an image summary for an
 * attachments-only message), edit and delete actions on the right.
 */
export function PendingMessagePanel({
  message,
  className,
  onEdit,
  onDelete,
}: {
  message: PendingMessage
  className?: string
  onEdit?: () => void
  onDelete?: () => void
}) {
  const { t } = useTranslation()
  const firstAttachment = message.attachments[0]
  const showSummary = !message.prompt && Boolean(firstAttachment)
  const allImages = message.attachments.every(isImageAttachment)

  return (
    <div
      // Anchored to the composer wrapper; the bottom 16px hide behind the card
      // (which stacks above), leaving 8px of visible surface under the row —
      // the same geometry as the empty-state project switcher strip.
      className={cn(
        'absolute inset-x-2 bottom-[calc(100%_-_16px)] flex items-center gap-2 rounded-t-3xl bg-project-switcher-surface px-3 pt-2 pb-6 text-sm',
        className,
      )}
      data-slot="pending-message"
    >
      <CornerDownRight className="size-4 shrink-0 text-foreground-subtlest" strokeWidth={1} />
      {showSummary ? (
        <span className="flex min-w-0 flex-1 items-center gap-2" title={message.prompt}>
          {isImageAttachment(firstAttachment) ? (
            <PendingImageThumb attachment={firstAttachment} />
          ) : (
            <FileText className="size-4 shrink-0" strokeWidth={1} />
          )}
          <span className="truncate">
            {allImages
              ? t('workbench.prompt.pendingImages', { count: message.attachments.length })
              : t('workbench.prompt.pendingFiles', { count: message.attachments.length })}
          </span>
        </span>
      ) : (
        <span className="min-w-0 flex-1 truncate" title={message.prompt}>
          {message.prompt}
        </span>
      )}
      {onEdit ? (
        <Button
          aria-label={t('workbench.prompt.pendingEdit')}
          className="size-7 rounded-full text-foreground-subtlest shadow-none"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          aria-label={t('workbench.prompt.pendingDelete')}
          className="size-7 rounded-full text-foreground-subtlest shadow-none"
          size="icon"
          type="button"
          variant="ghost"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )
}
