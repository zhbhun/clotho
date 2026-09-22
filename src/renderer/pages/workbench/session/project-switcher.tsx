import { FolderPlus } from 'lucide-react'
import { type ComponentProps, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'

import { ProjectIcon } from '../../../components/project-icon'
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

export function ProjectSwitchDialog({
  open,
  projectMode,
  projects,
  selectedProject,
  trigger,
  onAddProject,
  onOpenChange,
  onSelectProject,
}: ProjectSelectionProps & {
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
