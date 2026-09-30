import { useTranslation } from 'react-i18next'

import { SidebarTrigger, useSidebar } from '@/shadcn/sidebar'
import { cn } from '@/shadcn/utils'

import { SidebarToggleIcon } from '../../../components/sidebar-toggle-icon'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import type { SessionActivity, WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'
import { ProjectSwitcherButton } from './project-switcher-button'
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
  // The sidebar owns the top-left corner while it covers it; below the
  // breakpoint the drawer stays closed until toggled, freeing the inset.
  const showSidebarTrigger = isMobile ? !openMobile : state === 'collapsed'
  // Without tabs the selected session is the blank new-chat draft, whose
  // surface carries the project and history controls above the composer
  // instead; the header keeps them when nothing is selected at all.
  const showHeaderActions = sessions.length > 0 || activeSessionId === null

  return (
    <header
      className={cn(
        'session-tabs app-region-drag relative flex h-10 shrink-0 items-stretch bg-background pr-2 text-foreground-subtle',
        showSidebarTrigger ? 'pl-[84px]' : 'pl-1.5',
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
      {showHeaderActions ? (
        <div className="app-region-no-drag flex h-8 min-w-0 items-center self-center">
          <ProjectSwitcherButton
            projectMode={projectMode}
            projectName={projectName}
            projects={projects}
            selectedProject={selectedProject}
            projectSwitcherOpen={projectSwitcherOpen}
            onAddProject={onAddProject}
            onOpenChange={onProjectSwitcherOpenChange}
            onSelectProject={onSelectProject}
          />
        </div>
      ) : null}
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
      {showHeaderActions ? (
        <div className="session-tab-actions app-region-no-drag relative flex shrink-0 items-center px-1 text-foreground-subtlest">
          <SessionHistory
            activeSessionId={activeSessionId}
            error={historyError}
            isLoading={isHistoryLoading}
            open={historyOpen}
            sessionActivity={sessionActivity}
            sessions={historySessions}
            onOpenChange={onHistoryOpenChange}
            onRetry={onRetryHistory}
            onSelectSession={onSelectSession}
          />
        </div>
      ) : null}
    </header>
  )
}
