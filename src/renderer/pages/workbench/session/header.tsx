import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { SidebarTrigger, useSidebar } from '@/shadcn/sidebar'
import { cn } from '@/shadcn/utils'

import { SidebarToggleIcon } from '../../../components/sidebar-toggle-icon'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import type { SessionActivity, WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'
import { ProjectSwitchDialog } from './project-switcher'
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
  onStartNewSession,
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
  onStartNewSession: () => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { state } = useSidebar()
  const { t } = useTranslation()
  const showSidebarTrigger = state === 'collapsed'

  return (
    <>
      <header
        className={cn(
          'app-region-drag relative flex h-11 shrink-0 items-center bg-background pr-2 text-foreground-subtle',
          showSidebarTrigger ? 'pl-[84px]' : 'pl-3',
        )}
      >
        {showSidebarTrigger ? (
          <ShortcutTooltip
            commandId="workbench.sidebar.toggle"
            label={t('workbench.nav.toggleSidebar')}
            side="bottom"
          >
            <SidebarTrigger
              className="app-region-no-drag shrink-0"
              icon={SidebarToggleIcon}
              size="icon"
            />
          </ShortcutTooltip>
        ) : null}
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
                className="app-region-no-drag ml-1 max-w-[60vw]"
                data-window-project-title
                type="button"
                variant="ghost"
              >
                <span className="min-w-0 truncate">{projectName}</span>
                <ChevronDown data-icon="inline-end" strokeWidth={1} />
              </Button>
            </ShortcutTooltip>
          }
          onAddProject={onAddProject}
          onOpenChange={onProjectSwitcherOpenChange}
          onSelectProject={onSelectProject}
        />
      </header>
      {sessions.length ? (
        <SessionTabs
          activeSessionId={activeSessionId}
          historyError={historyError}
          historySessions={historySessions}
          historyOpen={historyOpen}
          isContentScrolled={isContentScrolled}
          isHistoryLoading={isHistoryLoading}
          pinnedSessionIds={pinnedSessionIds}
          sessionActivity={sessionActivity}
          sessions={sessions}
          onCloseSession={onCloseSession}
          onDeleteSession={onDeleteSession}
          onHistoryOpenChange={onHistoryOpenChange}
          onRenameSession={onRenameSession}
          onRetryHistory={onRetryHistory}
          onSelectSession={onSelectSession}
          onStartNewSession={onStartNewSession}
          onTogglePinSession={onTogglePinSession}
        />
      ) : null}
    </>
  )
}
