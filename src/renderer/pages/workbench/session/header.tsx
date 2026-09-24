import { CircleX, FolderKanban } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { SidebarTrigger, useSidebar } from '@/shadcn/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'

import { ProjectIcon } from '../../../components/project-icon'
import { SidebarToggleIcon } from '../../../components/sidebar-toggle-icon'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import type { SessionActivity, WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'
import { ProjectSwitchDialog } from './project-switcher'
import { SessionHistory } from './session-history'
import { SessionTabs } from './session-tabs'

export function ConversationHeader({
  activeSessionId,
  historyError = null,
  historyOpen,
  historySessions,
  isContentScrolled,
  isHistoryLoading = false,
  projectSwitcherOpen,
  projectMode,
  projectName,
  projects,
  pinnedSessionIds,
  selectedProject,
  sessionActivity,
  sessions,
  onAddProject,
  onCloseSession,
  onDeleteSession,
  onHistoryOpenChange,
  onProjectSwitcherOpenChange,
  onRenameSession,
  onRetryHistory = () => {},
  onSelectProject,
  onSelectSession,
  onTogglePinSession,
}: {
  activeSessionId: string | null
  historyError?: string | null
  historyOpen: boolean
  historySessions: WorkbenchSession[]
  isContentScrolled: boolean
  isHistoryLoading?: boolean
  projectSwitcherOpen: boolean
  projectMode: 'project' | 'home'
  projectName: string
  projects: WorkbenchProject[]
  pinnedSessionIds: ReadonlySet<string>
  selectedProject?: WorkbenchProject
  sessionActivity: Record<string, SessionActivity>
  sessions: WorkbenchSession[]
  onAddProject: () => void
  onCloseSession: (session: WorkbenchSession) => void
  onDeleteSession: (session: WorkbenchSession) => void
  onHistoryOpenChange: (isOpen: boolean) => void
  onProjectSwitcherOpenChange: (isOpen: boolean) => void
  onRenameSession: (session: WorkbenchSession) => void
  onRetryHistory?: () => void
  onSelectProject: (projectId: string | null) => void
  onSelectSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { isMobile, openMobile, state } = useSidebar()
  const { t } = useTranslation()
  const [isExitHovered, setExitHovered] = useState(false)
  // The sidebar owns the top-left corner while it covers it; below the
  // breakpoint the drawer stays closed until toggled, freeing the inset.
  const showSidebarTrigger = isMobile ? !openMobile : state === 'collapsed'
  const canExitProject = projectMode === 'project' && Boolean(selectedProject)

  return (
    <header
      className={cn(
        'session-tabs app-region-drag relative flex h-10 shrink-0 items-stretch bg-background pr-2 text-foreground-subtle',
        showSidebarTrigger ? 'pl-[84px]' : 'pl-3',
      )}
      data-content-scrolled={isContentScrolled ? 'true' : undefined}
      data-has-tabs={sessions.length > 0 ? 'true' : undefined}
    >
      {showSidebarTrigger ? (
        <ShortcutTooltip
          commandId="workbench.sidebar.toggle"
          label={t('workbench.nav.toggleSidebar')}
          side="bottom"
        >
          <SidebarTrigger
            className="app-region-no-drag mr-1.5 shrink-0 self-center"
            icon={SidebarToggleIcon}
            size="icon"
          />
        </ShortcutTooltip>
      ) : null}
      <div className="app-region-no-drag flex h-8 min-w-0 items-center self-center">
        <div
          className="group/project-header relative flex min-w-0 items-center"
          onMouseLeave={() => setExitHovered(false)}
        >
          <ProjectSwitchDialog
            open={projectSwitcherOpen}
            projectMode={projectMode}
            projects={projects}
            selectedProject={selectedProject}
            trigger={
              <ShortcutTooltip
                commandId="workbench.picker.project.open"
                label={t('workbench.project.switch')}
                side="bottom"
              >
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
                >
                  {selectedProject ? (
                    <ProjectIcon
                      className={cn(
                        'size-3.5',
                        canExitProject &&
                          'transition-opacity group-hover/project-header:opacity-0 group-focus-within/project-header:opacity-0',
                      )}
                      icon={selectedProject.icon}
                      plain
                      size="small"
                    />
                  ) : (
                    <FolderKanban className="size-3.5" />
                  )}
                  {selectedProject ? <span className="min-w-0 truncate">{projectName}</span> : null}
                </Button>
              </ShortcutTooltip>
            }
            onAddProject={onAddProject}
            onOpenChange={onProjectSwitcherOpenChange}
            onSelectProject={onSelectProject}
          />
          {canExitProject ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('workbench.project.exit')}
                    className="pointer-events-none absolute inset-y-0 left-1 my-auto bg-transparent opacity-0 transition-opacity group-hover/project-header:pointer-events-auto group-hover/project-header:opacity-100 group-focus-within/project-header:pointer-events-auto group-focus-within/project-header:opacity-100 hover:bg-transparent dark:hover:bg-transparent"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      setExitHovered(false)
                      onProjectSwitcherOpenChange(false)
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
      <SessionTabs
        activeSessionId={activeSessionId}
        pinnedSessionIds={pinnedSessionIds}
        sessionActivity={sessionActivity}
        sessions={sessions}
        onCloseSession={onCloseSession}
        onDeleteSession={onDeleteSession}
        onRenameSession={onRenameSession}
        onSelectSession={onSelectSession}
        onTogglePinSession={onTogglePinSession}
      />
      <div className="session-tab-actions app-region-no-drag relative flex shrink-0 items-center px-1 text-foreground-subtlest">
        <SessionHistory
          activeSessionId={activeSessionId}
          error={historyError}
          isLoading={isHistoryLoading}
          open={historyOpen}
          sessions={historySessions}
          onOpenChange={onHistoryOpenChange}
          onRetry={onRetryHistory}
          onSelectSession={onSelectSession}
        />
      </div>
    </header>
  )
}
