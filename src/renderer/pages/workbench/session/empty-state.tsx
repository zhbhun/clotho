import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { APP_CONTENT_CONTAINER_CLASS } from '../../../components/app-layout'
import { ClothoMark } from './clotho-mark'
import { PromptComposer, type PromptComposerBaseProps } from './prompt'

export type SessionEmptyStateProps = {
  composerProps: PromptComposerBaseProps
  error: string | null
  hasTabSessions: boolean
}

/** Surface shown when there is no conversation yet: brand mark centered above the bottom-docked composer. */
export function SessionEmptyState({
  composerProps,
  error,
  hasTabSessions,
}: SessionEmptyStateProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col',
        hasTabSessions ? 'pointer-events-none absolute inset-x-0 top-10 bottom-0' : 'flex-1',
      )}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6">
        <div
          className={cn(
            APP_CONTENT_CONTAINER_CLASS,
            'flex flex-col items-center gap-6 text-center',
          )}
        >
          <ClothoMark className="size-20 text-foreground/30" />
          <h1 className="text-3xl/9 font-normal tracking-tight text-foreground">
            {t('workbench.empty.slogan')}
          </h1>
        </div>
      </div>
      <div className={cn('shrink-0 px-6 pb-4', hasTabSessions && 'pointer-events-auto')}>
        <div className={cn(APP_CONTENT_CONTAINER_CLASS, 'flex flex-col gap-3')}>
          <PromptComposer {...composerProps} slashMenuPlacement="above" />
          {error ? (
            <p className="truncate text-xs text-destructive" title={error}>
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
