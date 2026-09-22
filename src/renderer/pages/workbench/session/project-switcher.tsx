import { FolderPlus, GitBranch, X } from 'lucide-react'
import { type ComponentProps, type ReactElement, type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'

import { DEFAULT_PROJECT_ICON, ProjectIcon } from '../../../components/project-icon'
import type { ClaudeProject } from '../../../services/claude/claude'
import { projectDisplayName } from '../../../utils/project'
import {
  SwitcherCommand,
  SwitcherCommandDialog,
  SwitcherCommandEmpty,
  SwitcherCommandGroup,
  SwitcherCommandInput,
  SwitcherCommandItem,
  SwitcherCommandList,
} from './switcher-command'

export type ProjectSelectionProps = {
  projectMode: 'project' | 'home'
  projects: ClaudeProject[]
  selectedProject?: ClaudeProject
  onAddProject: () => void
  onSelectHome: () => void
  onSelectProject: (projectId: string) => void
}

function ProjectTooltip({
  align = 'center',
  children,
  content,
  side = 'bottom',
  ...triggerProps
}: {
  align?: ComponentProps<typeof TooltipContent>['align']
  children: ReactElement
  content: ReactNode
  side?: ComponentProps<typeof TooltipContent>['side']
} & Omit<ComponentProps<typeof TooltipTrigger>, 'children' | 'render'>) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} {...triggerProps} />
      <TooltipContent align={align} side={side}>
        {content}
      </TooltipContent>
    </Tooltip>
  )
}

export function ProjectSwitcher({
  appearance = 'default',
  branch,
  projectMode,
  projects,
  selectedProject,
  onAddProject,
  onSelectHome,
  onSelectProject,
}: ProjectSelectionProps & {
  appearance?: 'default' | 'empty-surface'
  branch?: string | null
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isExitHovered, setExitHovered] = useState(false)
  const canExitProject = projectMode === 'project' && Boolean(selectedProject)
  const triggerLabel = selectedProject
    ? projectDisplayName(selectedProject)
    : t('workbench.project.select')
  const projectTrigger = (
    <Button
      aria-label={t('workbench.project.switch')}
      className={cn(
        'min-w-0 max-w-full justify-start',
        appearance === 'empty-surface'
          ? canExitProject
            ? 'gap-0.5 rounded-xl !pl-0.5 !pr-2'
            : 'gap-0.5 rounded-xl !pl-1 !pr-2'
          : 'rounded-xl !px-3',
        appearance === 'default' &&
          isExitHovered &&
          'bg-transparent! hover:bg-transparent! hover:text-foreground-subtle',
      )}
      data-active={appearance === 'empty-surface' && isExitHovered ? true : undefined}
      type="button"
      variant={appearance === 'empty-surface' ? 'surface' : 'outline'}
    >
      <ProjectIcon
        className={cn(
          appearance === 'empty-surface' ? 'h-3.5 w-6' : 'size-3.5',
          canExitProject &&
            'transition-opacity group-hover/project-switcher:opacity-0 group-focus-within/project-switcher:opacity-0',
        )}
        icon={selectedProject?.icon ?? DEFAULT_PROJECT_ICON}
        plain
        size="small"
      />
      <span className="min-w-0 truncate">{triggerLabel}</span>
    </Button>
  )

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 text-xs text-foreground-subtle',
        appearance === 'empty-surface' && 'flex-1',
      )}
    >
      <div
        className="group/project-switcher relative flex min-w-0 max-w-[60%]"
        onMouseLeave={() => setExitHovered(false)}
      >
        <ProjectSwitchDialog
          open={open}
          projectMode={projectMode}
          projects={projects}
          selectedProject={selectedProject}
          trigger={
            selectedProject?.path ? (
              <ProjectTooltip align="start" content={selectedProject.path}>
                {projectTrigger}
              </ProjectTooltip>
            ) : (
              projectTrigger
            )
          }
          onAddProject={onAddProject}
          onOpenChange={setOpen}
          onSelectProject={onSelectProject}
        />
        {canExitProject ? (
          <ProjectTooltip content={t('workbench.project.exit')}>
            <Button
              aria-label={t('workbench.project.exit')}
              className={cn(
                'pointer-events-none absolute inset-y-0 my-auto rounded-xl opacity-0 group-hover/project-switcher:pointer-events-auto group-hover/project-switcher:opacity-100 group-focus-within/project-switcher:pointer-events-auto group-focus-within/project-switcher:opacity-100',
                appearance === 'empty-surface' ? 'left-[3px]' : 'left-[5px]',
              )}
              size={appearance === 'empty-surface' ? 'icon-sm' : 'icon'}
              type="button"
              variant={appearance === 'empty-surface' ? 'surface-strong' : 'mute'}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setExitHovered(false)
                setOpen(false)
                onSelectHome()
              }}
              onMouseEnter={() => setExitHovered(true)}
              onMouseLeave={() => setExitHovered(false)}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <X className="size-3.5" />
            </Button>
          </ProjectTooltip>
        ) : null}
      </div>

      {branch ? (
        <ProjectTooltip align="start" content={branch}>
          <Button
            className={cn(
              'max-w-[35%] justify-start',
              appearance === 'empty-surface' ? 'rounded-xl !px-2' : 'rounded-xl !px-3',
            )}
            nativeButton={false}
            render={<span />}
            variant={appearance === 'empty-surface' ? 'surface' : 'outline'}
          >
            <GitBranch className="text-primary" data-icon="inline-start" />
            <span className="min-w-0 truncate">{branch}</span>
          </Button>
        </ProjectTooltip>
      ) : null}
    </div>
  )
}

export function ProjectSwitchDialog({
  open,
  projectMode,
  projects,
  selectedProject,
  trigger,
  onAddProject,
  onOpenChange,
  onSelectProject,
}: Omit<ProjectSelectionProps, 'onSelectHome'> & {
  open: boolean
  trigger: ReactElement
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <SwitcherCommandDialog
      description={t('workbench.project.dialogDescription')}
      open={open}
      title={t('workbench.project.switch')}
      trigger={trigger}
      onOpenChange={onOpenChange}
    >
      <SwitcherCommand
        defaultValue={projectMode === 'project' ? (selectedProject?.id ?? undefined) : 'claude'}
      >
        <SwitcherCommandInput
          actions={
            <ProjectTooltip content={t('workbench.project.add')}>
              <Button
                aria-label={t('workbench.project.add')}
                type="button"
                size="icon-lg"
                variant="ghost"
                onClick={() => {
                  onAddProject()
                  onOpenChange(false)
                }}
              >
                <FolderPlus />
              </Button>
            </ProjectTooltip>
          }
          placeholder={String(t('workbench.project.search'))}
        />
        <SwitcherCommandList>
          <SwitcherCommandEmpty>{t('workbench.project.empty')}</SwitcherCommandEmpty>
          <SwitcherCommandGroup>
            {projects.map((project) => {
              const name = projectDisplayName(project)

              return (
                <SwitcherCommandItem
                  key={project.id}
                  description={project.path}
                  iconElement={<ProjectIcon plain icon={project.icon} size="large" />}
                  keywords={[name, project.path]}
                  label={name}
                  value={project.id}
                  trailing={
                    project.additional_directories?.length ? (
                      <span className="spotlight-command-badge">{t('project.workspaceBadge')}</span>
                    ) : undefined
                  }
                  onSelect={() => {
                    onSelectProject(project.id)
                    onOpenChange(false)
                  }}
                />
              )
            })}
          </SwitcherCommandGroup>
        </SwitcherCommandList>
      </SwitcherCommand>
    </SwitcherCommandDialog>
  )
}
