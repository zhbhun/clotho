import { CircleX, FolderKanban } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'

import { Menu, MenuTrigger } from '../../../components/menu'
import { ProjectIcon } from '../../../components/project-icon'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import { type WorkbenchProject, useWorkbenchStore } from '../stores/workbench-store'
import { ProjectSwitcherMenuContent } from './project-switcher-menu'

export type ProjectSwitcherButtonProps = {
  className?: string
  projectMode: 'project' | 'home'
  projectName: string
  projects: WorkbenchProject[]
  selectedProject?: WorkbenchProject
  onAddProject: () => void
  onOpenProjectInNewWindow?: (projectId: string) => void
  onSelectProject: (projectId: string | null) => void
}

/** Project button; clicking opens the dropdown project menu, while the
    picker shortcut opens the quick switcher's project mode instead. */
export function ProjectSwitcherButton({
  className,
  projectMode,
  projectName,
  projects,
  selectedProject,
  onAddProject,
  onOpenProjectInNewWindow,
  onSelectProject,
}: ProjectSwitcherButtonProps) {
  const { t } = useTranslation()
  const windowKind = useWorkbenchStore((state) => state.windowKind)
  const [isExitHovered, setExitHovered] = useState(false)
  // Exiting a side project lands back on the home-base project (the built-in
  // homedir project), so while it is the active project the exit affordance
  // would only offer to leave the very place the X exists to return to. A
  // project window is bound to its project and never exits.
  const canExitProject =
    windowKind === 'free' &&
    projectMode === 'project' &&
    selectedProject !== undefined &&
    !selectedProject.is_home

  const triggerButton = (
    <MenuTrigger
      render={
        <Button
          className={cn(
            'min-w-0 max-w-[50vw]',
            canExitProject &&
              isExitHovered &&
              'bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_5%)] text-foreground',
          )}
          data-window-project-title
          type="button"
          variant="secondary"
        />
      }
    >
      {selectedProject ? (
        <ProjectIcon
          className={cn(
            'size-3.5',
            canExitProject &&
              'transition-opacity group-hover/project-switcher:opacity-0 group-focus-within/project-switcher:opacity-0',
          )}
          icon={selectedProject.icon}
          plain
          size="small"
        />
      ) : (
        <FolderKanban className="size-3.5" />
      )}
      {selectedProject ? <span className="min-w-0 truncate">{projectName}</span> : null}
    </MenuTrigger>
  )

  const trigger = (
    <ShortcutTooltip
      commandId="workbench.picker.project.open"
      label={t('workbench.project.switch')}
      side="bottom"
    >
      {triggerButton}
    </ShortcutTooltip>
  )

  return (
    <div className={cn('flex min-w-0 items-center', className)}>
      <div
        className="group/project-switcher relative flex min-w-0 items-center"
        onMouseLeave={() => setExitHovered(false)}
      >
        <Menu>
          {trigger}
          <ProjectSwitcherMenuContent
            projectMode={projectMode}
            projects={projects}
            selectedProject={selectedProject}
            onAddProject={onAddProject}
            onOpenProjectInNewWindow={onOpenProjectInNewWindow}
            onSelectProject={onSelectProject}
          />
        </Menu>
        {canExitProject ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('workbench.project.exit')}
                  className="pointer-events-none absolute inset-y-0 left-1 my-auto bg-transparent opacity-0 transition-opacity hover:bg-transparent group-hover/project-switcher:pointer-events-auto group-hover/project-switcher:opacity-100 group-focus-within/project-switcher:pointer-events-auto group-focus-within/project-switcher:opacity-100 dark:hover:bg-transparent"
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setExitHovered(false)
                    onSelectProject(null)
                  }}
                  onMouseEnter={() => setExitHovered(true)}
                  onMouseLeave={() => setExitHovered(false)}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/6">
                    <CircleX className="size-3.5" strokeWidth={1.5} />
                  </span>
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
