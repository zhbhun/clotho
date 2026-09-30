import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { APP_CONTENT_CONTAINER_CLASS } from '../../../components/app-layout'
import type { WorkbenchProject } from '../stores/workbench-store'
import { ClothoMark } from './clotho-mark'
import { ProjectSwitcherButton } from './project-switcher-button'
import { PromptComposer, type PromptComposerBaseProps } from './prompt'
import { SessionHistoryButton } from './session-history'

export type SessionEmptyStateProps = {
  composerProps: PromptComposerBaseProps
  error: string | null
  hasTabSessions: boolean
  projectMode: 'project' | 'home'
  projectName: string
  selectedProject?: WorkbenchProject
  onSelectProject: (projectId: string | null) => void
}

/** Surface shown when there is no conversation yet: brand mark centered above the bottom-docked composer. */
export function SessionEmptyState({
  composerProps,
  error,
  hasTabSessions,
  projectMode,
  projectName,
  selectedProject,
  onSelectProject,
}: SessionEmptyStateProps) {
  const { t } = useTranslation()
  // Without tabs the selected session is the blank new-chat draft, so the
  // project and history controls move from the header onto a strip attached
  // to the composer.
  const showProjectStrip = !hasTabSessions

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
          {showProjectStrip ? (
            /* The strip and composer stack without the surrounding gap so the
               composer overlaps the strip's bottom padding, leaving 8px of
               visible surface above and below the button row. */
            <div className="flex flex-col">
              <div className="mx-2 flex min-h-14 items-center rounded-t-3xl bg-project-switcher-surface px-2 pt-2 pb-6">
                <ProjectSwitcherButton
                  appearance="empty-surface"
                  className="flex-1"
                  projectMode={projectMode}
                  projectName={projectName}
                  selectedProject={selectedProject}
                  onSelectProject={onSelectProject}
                />
                <SessionHistoryButton appearance="empty-surface" />
              </div>
              <div className="relative z-10 -mt-4">
                <PromptComposer
                  {...composerProps}
                  className="rounded-3xl"
                  shadowDirection="downward"
                  slashMenuPlacement="below"
                />
              </div>
            </div>
          ) : (
            <PromptComposer {...composerProps} slashMenuPlacement="above" />
          )}
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
