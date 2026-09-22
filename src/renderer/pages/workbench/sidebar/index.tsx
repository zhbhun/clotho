import { Settings, SquarePen } from 'lucide-react'
import { type KeyboardEvent, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shadcn/sidebar'

import { TransientScrollArea } from '../../../components/transient-scroll-area'
import type { WorkbenchSession } from '../stores/workbench-store'
import type { SessionTimelineGroup } from '../utils/session-list'
import { MacWindowChrome } from './mac-window-chrome'
import { SidebarResizeHandle } from './resize-handle'
import { SessionListTabs } from './session-list-tabs'
import './session-sidebar.css'
import { SidebarState } from './sidebar-state'
import { VirtualSessionList } from './virtual-session-list'

export function SessionSidebar({
  activeTab,
  focusNavigationRevision = 0,
  focusedSessionId,
  onTabChange,
  selectedSession,
  sessionTimeline,
  onDeleteSession,
  onListKeyDown,
  onOpenSettings,
  onRenameSession,
  onSelectSession,
  onStartNewSession,
  onTogglePinSession,
}: {
  activeTab: 'current' | 'history'
  focusNavigationRevision?: number
  focusedSessionId: string | null
  onTabChange: (tab: 'current' | 'history') => void
  selectedSession: WorkbenchSession | null
  sessionTimeline: SessionTimelineGroup[]
  onDeleteSession: (session: WorkbenchSession) => void
  onListKeyDown: (event: KeyboardEvent) => void
  onOpenSettings: () => void
  onRenameSession: (session: WorkbenchSession) => void
  onSelectSession: (session: WorkbenchSession) => void
  onStartNewSession: () => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const [locateRequestRevision, setLocateRequestRevision] = useState(0)
  const [enterListRevision, setEnterListRevision] = useState(0)
  const sessionCount = sessionTimeline.reduce((total, group) => total + group.sessions.length, 0)
  const selectedSessionId = selectedSession?.id ?? null
  const isSessionInList = (sessionId: string | null) =>
    sessionId !== null &&
    sessionTimeline.some((group) => group.sessions.some((entry) => entry.session.id === sessionId))

  const locateCurrentSession = () => setLocateRequestRevision((revision) => revision + 1)
  const scrollToTop = () => viewport?.scrollTo({ top: 0, behavior: 'smooth' })
  const handleTabIntoSessions = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Tab' || event.shiftKey || !isSessionInList(focusedSessionId)) return
    event.preventDefault()
    setEnterListRevision((revision) => revision + 1)
  }

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-0 p-0">
        <MacWindowChrome />

        <SidebarMenu className="-mt-1 h-10 justify-center px-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-[30px] px-2 text-sm font-normal"
              onClick={onStartNewSession}
              tabIndex={0}
            >
              <SquarePen />
              <span>{t('workbench.session.new')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SessionListTabs
          activeTab={activeTab}
          canLocateCurrent={isSessionInList(selectedSessionId)}
          onLocateCurrent={locateCurrentSession}
          onScrollToTop={scrollToTop}
          onTabChange={onTabChange}
          onTabIntoSessions={handleTabIntoSessions}
        />
      </SidebarHeader>

      <TransientScrollArea
        className="sidebar-session-scroll min-h-0 flex-1"
        viewportRef={setViewport}
        viewportProps={{
          onKeyDown: onListKeyDown,
          tabIndex: -1,
        }}
      >
        <SidebarContent className="min-h-full w-full min-w-0 flex-none gap-2 overflow-visible pb-5">
          {sessionCount ? (
            <VirtualSessionList
              enterListRevision={enterListRevision}
              focusNavigationRevision={focusNavigationRevision}
              focusedSessionId={focusedSessionId}
              locateRequestRevision={locateRequestRevision}
              selectedSessionId={selectedSessionId}
              sessionTimeline={sessionTimeline}
              viewport={viewport}
              onDeleteSession={onDeleteSession}
              onRenameSession={onRenameSession}
              onSelectSession={onSelectSession}
              onTogglePinSession={onTogglePinSession}
            />
          ) : (
            <SidebarState
              label={t(
                activeTab === 'current'
                  ? 'workbench.nav.noOpenSessions'
                  : 'workbench.nav.noSessions',
              )}
            />
          )}
        </SidebarContent>
      </TransientScrollArea>

      <div
        aria-hidden="true"
        className="pointer-events-none relative z-10 -mt-4 h-4 shrink-0 bg-linear-to-b from-transparent via-sidebar/45 to-sidebar"
        data-sidebar-scroll-hint
      />

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-[30px] px-2 text-sm font-normal"
              tabIndex={0}
              onClick={onOpenSettings}
            >
              <Settings />
              <span>{t('workbench.nav.settings')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarResizeHandle />
    </Sidebar>
  )
}
