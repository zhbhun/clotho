import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { SidebarTrigger, useSidebar } from '@/shadcn/sidebar'
import { cn } from '@/shadcn/utils'

import { DEFAULT_PROJECT_ICON, ProjectIcon } from '../../../components/project-icon'
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
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { state } = useSidebar()
  const { t } = useTranslation()
  const showSidebarTrigger = state === 'collapsed'

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
      <div className="app-region-no-drag mr-3 flex min-w-0 items-center self-center">
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
                className="min-w-0 max-w-[50vw]"
                data-window-project-title
                type="button"
                variant="ghost"
              >
                <ProjectIcon
                  className="size-3.5"
                  icon={selectedProject?.icon ?? DEFAULT_PROJECT_ICON}
                  plain
                  size="small"
                />
                <span className="min-w-0 truncate">{projectName}</span>
              </Button>
            </ShortcutTooltip>
          }
          onAddProject={onAddProject}
          onOpenChange={onProjectSwitcherOpenChange}
          onSelectProject={onSelectProject}
        />
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
