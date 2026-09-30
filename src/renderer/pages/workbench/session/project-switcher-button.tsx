import { CircleX, FolderKanban, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'

import { DEFAULT_PROJECT_ICON, ProjectIcon } from '../../../components/project-icon'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import type { WorkbenchProject } from '../stores/workbench-store'
import { ProjectSwitchDialog, ProjectTooltip } from './project-switcher'

export type ProjectSwitcherButtonProps = {
  appearance?: 'header' | 'empty-surface'
  className?: string
  projectMode: 'project' | 'home'
  projectName: string
  projects: WorkbenchProject[]
  selectedProject?: WorkbenchProject
  projectSwitcherOpen: boolean
  onAddProject: () => void
  onOpenChange: (isOpen: boolean) => void
  onSelectProject: (projectId: string | null) => void
}

/** Project button opening the switcher dialog, shared by the header row and the empty-surface strip. */
export function ProjectSwitcherButton({
  appearance = 'header',
  className,
  projectMode,
  projectName,
  projects,
  selectedProject,
  projectSwitcherOpen,
  onAddProject,
  onOpenChange,
  onSelectProject,
}: ProjectSwitcherButtonProps) {
  const { t } = useTranslation()
  const [isExitHovered, setExitHovered] = useState(false)
  const isHeader = appearance === 'header'
  // Exiting a side project lands back on the home-base project (the built-in
  // homedir project), so while it is the active project the exit affordance
  // would only offer to leave the very place the X exists to return to.
  const canExitProject =
    projectMode === 'project' && selectedProject !== undefined && !selectedProject.is_home

  const button = (
    <Button
      className={cn(
        'min-w-0',
        isHeader
          ? 'max-w-[50vw]'
          : cn(
              'max-w-full justify-start rounded-xl gap-0.5',
              canExitProject ? '!pl-0.5' : '!pl-1',
              '!pr-2',
            ),
        isHeader &&
          canExitProject &&
          isExitHovered &&
          'bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_5%)] text-foreground',
      )}
      data-active={!isHeader && isExitHovered ? true : undefined}
      data-window-project-title
      type="button"
      variant={isHeader ? 'secondary' : 'surface'}
    >
      {selectedProject ? (
        <ProjectIcon
          className={cn(
            isHeader ? 'size-3.5' : 'h-3.5 w-6',
            canExitProject &&
              'transition-opacity group-hover/project-switcher:opacity-0 group-focus-within/project-switcher:opacity-0',
          )}
          icon={selectedProject.icon}
          plain
          size="small"
        />
      ) : isHeader ? (
        <FolderKanban className="size-3.5" />
      ) : (
        <ProjectIcon className="h-3.5 w-6" icon={DEFAULT_PROJECT_ICON} plain size="small" />
      )}
      {selectedProject || !isHeader ? (
        <span className="min-w-0 truncate">
          {selectedProject ? projectName : t('workbench.project.select')}
        </span>
      ) : null}
    </Button>
  )

  const trigger = isHeader ? (
    <ShortcutTooltip
      commandId="workbench.picker.project.open"
      label={t('workbench.project.switch')}
      side="bottom"
    >
      {button}
    </ShortcutTooltip>
  ) : selectedProject?.path ? (
    <ProjectTooltip align="start" content={selectedProject.path} side="bottom">
      {button}
    </ProjectTooltip>
  ) : (
    button
  )

  return (
    <div className={cn('flex min-w-0 items-center', className)}>
      <div
        className="group/project-switcher relative flex min-w-0 items-center"
        onMouseLeave={() => setExitHovered(false)}
      >
        <ProjectSwitchDialog
          open={projectSwitcherOpen}
          projectMode={projectMode}
          projects={projects}
          selectedProject={selectedProject}
          trigger={trigger}
          onAddProject={onAddProject}
          onOpenChange={onOpenChange}
          onSelectProject={onSelectProject}
        />
        {canExitProject ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('workbench.project.exit')}
                  className={cn(
                    'pointer-events-none absolute inset-y-0 my-auto opacity-0 transition-opacity group-hover/project-switcher:pointer-events-auto group-hover/project-switcher:opacity-100 group-focus-within/project-switcher:pointer-events-auto group-focus-within/project-switcher:opacity-100',
                    isHeader
                      ? 'left-1 bg-transparent hover:bg-transparent dark:hover:bg-transparent'
                      : 'left-[3px] rounded-xl',
                  )}
                  size="icon-sm"
                  type="button"
                  variant={isHeader ? 'ghost' : 'surface-strong'}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setExitHovered(false)
                    onOpenChange(false)
                    onSelectProject(null)
                  }}
                  onMouseEnter={() => setExitHovered(true)}
                  onMouseLeave={() => setExitHovered(false)}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {isHeader ? (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/6">
                      <CircleX className="size-3.5" strokeWidth={1.5} />
                    </span>
                  ) : (
                    <X className="size-3.5" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="bottom">{t('workbench.project.exit')}</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  )
}
