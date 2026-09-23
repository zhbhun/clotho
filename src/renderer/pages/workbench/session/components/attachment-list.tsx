import { FileText, ImageIcon, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from '@/shadcn/attachment'
import { cn } from '@/shadcn/utils'
import type { ClaudeAttachment } from '@/shared/rpc'

import { TransientScrollArea } from '../../../../components/transient-scroll-area'

function useAttachmentImage(attachment: ClaudeAttachment) {
  const content = attachment.content
  const isImage =
    content?.type === 'image' ||
    Boolean(content?.source.path && /\.(png|jpe?g|gif|webp)$/i.test(content.source.path))
  const source =
    content?.type === 'image'
      ? `data:${content.source.media_type};base64,${content.source.data}`
      : undefined
  return { isImage, source }
}

// Surface tokens (bg-card / bg-muted) assume the card sits on the page background; embedded in a
// bg-muted message bubble that order inverts. Embedded cards keep the composer's outline-plus-tile
// form, with the fills recomputed one step away from the bubble (the command chip's mix).
const EMBEDDED_FILL = 'bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_8%)]'

function AttachmentCard({
  attachment,
  disabled,
  isEmbedded,
  onRemove,
}: {
  attachment: ClaudeAttachment
  disabled?: boolean
  isEmbedded?: boolean
  onRemove?: () => void
}) {
  const { t } = useTranslation()
  const [failedSource, setFailedSource] = useState<string>()
  const { isImage, source } = useAttachmentImage(attachment)
  const extension = attachment.name.includes('.') ? attachment.name.split('.').at(-1) : undefined

  return (
    <Attachment
      aria-label={attachment.name}
      className={cn(
        'h-16 flex-nowrap rounded-xl',
        isImage ? 'w-16 min-w-16 p-0!' : 'min-w-32 max-w-48',
        isEmbedded && [
          'border-[color-mix(in_oklab,var(--secondary),var(--foreground)_14%)] bg-transparent',
          'has-[>a,>button]:hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_8%)]',
        ],
      )}
      tabIndex={onRemove && !disabled ? 0 : undefined}
      title={attachment.name}
    >
      <AttachmentMedia
        className={cn(
          isImage ? 'size-full rounded-[inherit]' : undefined,
          isEmbedded && !isImage && EMBEDDED_FILL,
        )}
        variant={isImage ? 'image' : 'icon'}
      >
        {source && source !== failedSource ? (
          <img
            alt={attachment.name}
            className="size-full object-cover"
            src={source}
            onError={() => setFailedSource(source)}
          />
        ) : isImage ? (
          <ImageIcon />
        ) : (
          <FileText />
        )}
      </AttachmentMedia>
      {!isImage ? (
        <AttachmentContent>
          <AttachmentTitle>{attachment.name}</AttachmentTitle>
          <AttachmentDescription>{extension?.toUpperCase() ?? 'FILE'}</AttachmentDescription>
        </AttachmentContent>
      ) : null}
      {onRemove ? (
        <AttachmentActions className="absolute -top-1.5 -right-1.5 opacity-0 transition-opacity group-focus-within/attachment:opacity-100 group-hover/attachment:opacity-100">
          <AttachmentAction
            aria-label={t('workbench.prompt.removeFile', { name: attachment.name })}
            className="rounded-full bg-popover ring-1 ring-foreground/10"
            disabled={disabled}
            variant="secondary"
            onClick={onRemove}
            onMouseDown={(event) => {
              // Keep the composer focused while removing an attachment.
              event.preventDefault()
            }}
          >
            <X />
          </AttachmentAction>
        </AttachmentActions>
      ) : null}
    </Attachment>
  )
}

export function AttachmentList({
  attachments,
  className,
  disabled,
  isEmbedded,
  onRemove,
}: {
  attachments: ClaudeAttachment[]
  className?: string
  disabled?: boolean
  isEmbedded?: boolean
  onRemove?: (index: number) => void
}) {
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
        return
      const previous = viewport.scrollLeft
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1
      viewport.scrollLeft += event.deltaY * scale
      if (viewport.scrollLeft !== previous) event.preventDefault()
    }
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [])

  return (
    <TransientScrollArea
      className={cn('min-w-0 shrink-0', className)}
      orientation="horizontal"
      viewportProps={onRemove ? { tabIndex: -1 } : undefined}
      viewportRef={viewportRef}
    >
      {/* pt keeps the straddling remove badge inside the scroll viewport; gap clears its overhang. */}
      <div className="flex w-max min-w-0 gap-2.5 pt-1.5 pb-2" data-slot="attachment-list">
        {attachments.map((attachment, index) => (
          <AttachmentCard
            key={attachment.content?.source.path ?? `${attachment.name}:${index}`}
            attachment={attachment}
            disabled={disabled}
            isEmbedded={isEmbedded}
            onRemove={onRemove ? () => onRemove(index) : undefined}
          />
        ))}
      </div>
    </TransientScrollArea>
  )
}
