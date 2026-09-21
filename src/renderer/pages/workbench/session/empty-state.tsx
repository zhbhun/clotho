import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { APP_CONTENT_CONTAINER_CLASS } from '../../../components/app-layout'
import type { WorkbenchProject } from '../stores/workbench-store'
import { ClothoMark } from './clotho-mark'
import { ProjectSwitcher } from './project-switcher'
import { PromptComposer, type PromptComposerBaseProps } from './prompt'

export type SessionEmptyStateProps = {
  composerProps: PromptComposerBaseProps
  error: string | null
  hasTabSessions: boolean
  projectMode: 'project' | 'home'
  projects: WorkbenchProject[]
  selectedBranch?: string | null
  selectedProject?: WorkbenchProject
  onAddProject: () => void
  onSelectProject: (projectId: string | null) => void
}

/** Surface shown when there is no conversation yet: brand mark, project switcher, and the composer. */
export function SessionEmptyState({
  composerProps,
  error,
  hasTabSessions,
  projectMode,
  projects,
  selectedBranch,
  selectedProject,
  onAddProject,
  onSelectProject,
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
          <div className="flex flex-col">
            <div className="mx-2 flex min-h-14 items-center rounded-t-3xl bg-project-switcher-surface px-2 pt-2 pb-6">
              <ProjectSwitcher
                appearance="empty-surface"
                branch={selectedBranch}
                projectMode={projectMode}
                projects={projects}
                selectedProject={selectedProject}
                onAddProject={onAddProject}
                onSelectHome={() => onSelectProject(null)}
                onSelectProject={onSelectProject}
              />
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
