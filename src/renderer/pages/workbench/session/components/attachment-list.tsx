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

function AttachmentCard({
  attachment,
  disabled,
  onRemove,
}: {
  attachment: ClaudeAttachment
  disabled?: boolean
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
        isImage ? 'w-16 min-w-16 overflow-hidden p-0!' : 'w-52 max-w-64',
      )}
      tabIndex={onRemove && !disabled ? 0 : undefined}
      title={attachment.name}
    >
      <AttachmentMedia
        className={isImage ? 'size-full rounded-none' : undefined}
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
        <AttachmentContent className={onRemove ? 'pr-5' : undefined}>
          <AttachmentTitle>{attachment.name}</AttachmentTitle>
          <AttachmentDescription>{extension?.toUpperCase() ?? 'FILE'}</AttachmentDescription>
        </AttachmentContent>
      ) : null}
      {onRemove ? (
        <AttachmentActions className="absolute top-1 right-1">
          <AttachmentAction
            aria-label={t('workbench.prompt.removeFile', { name: attachment.name })}
            className="rounded-full"
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
  onRemove,
}: {
  attachments: ClaudeAttachment[]
  className?: string
  disabled?: boolean
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
      className={cn('-mx-0.5 -mt-0.5 min-w-0 shrink-0', className)}
      orientation="horizontal"
      viewportProps={onRemove ? { tabIndex: -1 } : undefined}
      viewportRef={viewportRef}
    >
      {/* Reserve room for the focus ring without changing the attachments' visible inset. */}
      <div className="flex w-max min-w-0 gap-2 px-0.5 pt-0.5 pb-2" data-slot="attachment-list">
        {attachments.map((attachment, index) => (
          <AttachmentCard
            key={attachment.content?.source.path ?? `${attachment.name}:${index}`}
            attachment={attachment}
            disabled={disabled}
            onRemove={onRemove ? () => onRemove(index) : undefined}
          />
        ))}
      </div>
    </TransientScrollArea>
  )
}
