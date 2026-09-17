import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { FailureEmpty } from '../../../components/failure-empty'
import { ClothoMark } from '../session/clotho-mark'

export function WorkbenchStartupLoading() {
  return (
    <div className="flex h-svh w-full items-center justify-center bg-background text-foreground">
      <ClothoMark className="size-20 motion-safe:animate-pulse" />
    </div>
  )
}

export function LoadFailure({
  className,
  compact = false,
  description,
  isRetrying = false,
  title,
  onRetry,
}: {
  className?: string
  compact?: boolean
  description: string
  isRetrying?: boolean
  title: string
  onRetry: () => void
}) {
  const { t } = useTranslation()

  return (
    <FailureEmpty
      actionLabel={t('workbench.action.retry')}
      className={cn(compact && 'min-h-40', className)}
      description={description}
      isActionPending={isRetrying}
      title={title}
      onAction={onRetry}
    />
  )
}

export function WorkbenchStartupFailure({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()

  return (
    <LoadFailure
      className="h-svh w-full bg-background text-foreground"
      description={t('workbench.loading.projectsFailed')}
      title={t('workbench.loading.projectsFailedTitle')}
      onRetry={onRetry}
    />
  )
}
