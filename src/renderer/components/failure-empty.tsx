import { CircleAlert } from 'lucide-react'

import { Button } from '@/shadcn/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/empty'
import { Spinner } from '@/shadcn/spinner'
import { cn } from '@/shadcn/utils'

export function FailureEmpty({
  actionLabel,
  className,
  description,
  isActionPending = false,
  title,
  onAction,
}: {
  actionLabel: string
  className?: string
  description: string
  isActionPending?: boolean
  title: string
  onAction: () => void
}) {
  return (
    <Empty className={cn('min-h-48', className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleAlert />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          disabled={isActionPending}
          size="sm"
          type="button"
          variant="outline"
          onClick={onAction}
        >
          {isActionPending ? <Spinner data-icon="inline-start" /> : null}
          {actionLabel}
        </Button>
      </EmptyContent>
    </Empty>
  )
}
