import { AppWindow, CircleX, FolderPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  MenuContent,
  MenuEmpty,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuSeparator,
  useMenuClose,
} from '../../../components/menu'
import { ProjectIcon } from '../../../components/project-icon'
import type { ClaudeProject } from '../../../services/claude/claude'
import { isUserProject, projectDisplayName } from '../../../utils/project'
import { useWorkbenchStore } from '../stores/workbench-store'
import { tildePath } from '../utils/path-display'
import { MiddlePath } from './components/middle-path'
import { ProjectWindowAction } from './project-window-action'

export type ProjectSwitcherMenuContentProps = {
  projectMode: 'project' | 'home'
  projects: ClaudeProject[]
  selectedProject?: ClaudeProject
  onAddProject: () => void
  onOpenProjectInNewWindow?: (projectId: string) => void
  onSelectProject: (projectId: string | null) => void
}

/** Dropdown body for the project button: searchable project rows plus the
    add / no-project actions pinned below the list. */
export function ProjectSwitcherMenuContent({
  projectMode,
  projects,
  selectedProject,
  onAddProject,
  onOpenProjectInNewWindow,
  onSelectProject,
}: ProjectSwitcherMenuContentProps) {
  const { t } = useTranslation()
  const closeMenu = useMenuClose()
  const windowKind = useWorkbenchStore((state) => state.windowKind)
  const focusedProjectId = useWorkbenchStore((state) => state.focusedProjectId)
  const focusedProjectIds = useWorkbenchStore((state) => state.focusedProjectIds)
  // A focused window is bound to its project, so leaving for "no project" is
  // only offered in the main window.
  const canExitProject =
    windowKind === 'main' &&
    projectMode === 'project' &&
    selectedProject !== undefined &&
    !selectedProject.is_home

  return (
    <MenuContent
      align="start"
      aria-label={t('workbench.project.switch')}
      className="w-[min(400px,calc(100vw-2rem))] shadow-float"
      glass
    >
      <MenuSearch placeholder={t('workbench.project.search')} />
      <MenuSeparator />
      <MenuList>
        <MenuEmpty>{t('workbench.project.empty')}</MenuEmpty>
        <MenuGroup>
          {projects.filter(isUserProject).map((project) => {
            const name = projectDisplayName(project)
            const isOwnProject = project.id === focusedProjectId
            const isInOtherWindow = !isOwnProject && focusedProjectIds.includes(project.id)

            return (
              <MenuItem
                key={project.id}
                keywords={[name, project.path]}
                selected={selectedProject?.id === project.id}
                // The value drives cmdk's single keyboard highlight, so it
                // must be unique; searchable text lives in the keywords.
                value={project.id}
                onSelect={() => onSelectProject(project.id)}
              >
                <ProjectIcon className="size-5 shrink-0" plain icon={project.icon} size="default" />
                <span className="truncate text-sm/5">{name}</span>
                <MiddlePath
                  className="min-w-0 flex-1 text-[12px] text-foreground-subtlest!"
                  path={tildePath(project.path)}
                />
                {isInOtherWindow ? (
                  <span
                    className="flex shrink-0 items-center text-foreground-subtlest"
                    title={t('workbench.project.inOtherWindow')}
                  >
                    <AppWindow className="size-3.5" strokeWidth={1.5} />
                  </span>
                ) : null}
                {onOpenProjectInNewWindow && !isOwnProject ? (
                  <ProjectWindowAction
                    className="-my-1 -mr-1"
                    onOpen={() => {
                      closeMenu?.()
                      onOpenProjectInNewWindow(project.id)
                    }}
                  />
                ) : null}
              </MenuItem>
            )
          })}
        </MenuGroup>
      </MenuList>
      <MenuSeparator />
      {/* Mirror the project rows' icon footprint (size-5 box, size-4 glyph) so
          the labels below the list line up with the project names above. */}
      <MenuItem forceMount value="project-menu-add" onSelect={() => onAddProject()}>
        <span className="flex size-5 shrink-0 items-center justify-center">
          <FolderPlus className="size-4" strokeWidth={1.5} />
        </span>
        {t('workbench.project.add')}
      </MenuItem>
      {canExitProject ? (
        <MenuItem forceMount value="project-menu-exit" onSelect={() => onSelectProject(null)}>
          <span className="flex size-5 shrink-0 items-center justify-center">
            <CircleX className="size-4" strokeWidth={1.5} />
          </span>
          {t('workbench.project.exit')}
        </MenuItem>
      ) : null}
    </MenuContent>
  )
}
