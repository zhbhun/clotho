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

/** Surface shown when there is no conversation yet: brand mark and the composer. */
export function SessionEmptyState({
  composerProps,
  error,
  hasTabSessions,
}: SessionEmptyStateProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn(
        'px-6',
        hasTabSessions
          ? 'pointer-events-none absolute inset-x-0 top-10 bottom-0 flex items-center justify-center overflow-y-auto'
          : 'flex flex-1 items-center justify-center',
      )}
    >
      <div
        className={cn(
          APP_CONTENT_CONTAINER_CLASS,
          'flex flex-col gap-32',
          hasTabSessions && 'pointer-events-auto',
        )}
      >
        <div className="flex flex-col items-center gap-6 text-center">
          <ClothoMark className="size-16 text-foreground" />
          <h1 className="text-3xl/9 font-normal tracking-tight text-foreground">
            {t('workbench.empty.slogan')}
          </h1>
        </div>
        <div className="flex flex-col gap-3">
          <PromptComposer
            {...composerProps}
            className="rounded-3xl"
            shadowDirection="downward"
            slashMenuPlacement="below"
          />
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
