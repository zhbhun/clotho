import { useCallback, useEffect, useState } from 'react'

import { useSidebar } from '@/shadcn/sidebar'

import { useCommandHandler } from '../../hooks/use-command-handler'
import { type WorkbenchLocation, createWorkbenchNavigationHistory } from './navigation-history'
import type { WorkbenchSession } from './stores/workbench-store'

function adjacentSession(
  sessions: WorkbenchSession[],
  currentSessionId: string | null,
  direction: -1 | 1,
  wraps: boolean,
) {
  if (!currentSessionId || sessions.length < 2) return null
  const currentIndex = sessions.findIndex((session) => session.id === currentSessionId)
  if (currentIndex < 0) return null
  const nextIndex = currentIndex + direction
  if (wraps) return sessions[(nextIndex + sessions.length) % sessions.length]
  return sessions[nextIndex] ?? null
}

function NumberedTabShortcut({
  position,
  session,
  onSelectSession,
}: {
  position: number
  session?: WorkbenchSession
  onSelectSession: (session: WorkbenchSession) => void
}) {
  useCommandHandler(
    `workbench.tab.activate.${position}`,
    () => {
      if (session) onSelectSession(session)
    },
    { enabled: Boolean(session) },
  )

  return null
}

export function WorkbenchShortcuts({
  currentLocation,
  selectedSession,
  sidebarSessions,
  tabSessions,
  isLocationAvailable,
  onCloseSession,
  onNavigate,
  onNewSession,
  onOpenSettings,
  onSelectSession,
}: {
  currentLocation: WorkbenchLocation
  selectedSession: WorkbenchSession | null
  sidebarSessions: WorkbenchSession[]
  tabSessions: WorkbenchSession[]
  isLocationAvailable: (location: WorkbenchLocation) => boolean
  onCloseSession: (session: WorkbenchSession) => void
  onNavigate: (location: WorkbenchLocation) => void
  onNewSession: () => void
  onOpenSettings: () => void
  onSelectSession: (session: WorkbenchSession) => void
}) {
  const { toggleSidebar } = useSidebar()
  const [history] = useState(() => createWorkbenchNavigationHistory(currentLocation))
  const [, setHistoryVersion] = useState(0)
  const { projectId: currentProjectId, sessionId: currentLocationSessionId } = currentLocation

  useEffect(() => {
    history.visit({ projectId: currentProjectId, sessionId: currentLocationSessionId })
    setHistoryVersion((version) => version + 1)
  }, [currentLocationSessionId, currentProjectId, history])

  const navigateHistory = useCallback(
    (direction: 'back' | 'forward') => {
      const location = history[direction](isLocationAvailable)
      if (!location) return
      setHistoryVersion((version) => version + 1)
      onNavigate(location)
    },
    [history, isLocationAvailable, onNavigate],
  )

  const currentSessionId = selectedSession?.id ?? null
  const previousTab = adjacentSession(tabSessions, currentSessionId, -1, true)
  const nextTab = adjacentSession(tabSessions, currentSessionId, 1, true)
  const previousSidebarSession = adjacentSession(sidebarSessions, currentSessionId, -1, false)
  const nextSidebarSession = adjacentSession(sidebarSessions, currentSessionId, 1, false)

  useCommandHandler('workbench.sidebar.toggle', toggleSidebar)
  useCommandHandler('workbench.session.new', onNewSession)
  useCommandHandler(
    'workbench.session.close',
    () => {
      if (selectedSession) onCloseSession(selectedSession)
    },
    { enabled: Boolean(selectedSession) },
  )
  useCommandHandler('workbench.navigation.back', () => navigateHistory('back'), {
    enabled: history.canBack(isLocationAvailable),
  })
  useCommandHandler('workbench.navigation.forward', () => navigateHistory('forward'), {
    enabled: history.canForward(isLocationAvailable),
  })
  useCommandHandler(
    'workbench.tab.previous',
    () => {
      if (previousTab) onSelectSession(previousTab)
    },
    { enabled: Boolean(previousTab) },
  )
  useCommandHandler(
    'workbench.tab.next',
    () => {
      if (nextTab) onSelectSession(nextTab)
    },
    { enabled: Boolean(nextTab) },
  )
  useCommandHandler(
    'workbench.sidebar.session.previous',
    () => {
      if (previousSidebarSession) onSelectSession(previousSidebarSession)
    },
    { enabled: Boolean(previousSidebarSession) },
  )
  useCommandHandler(
    'workbench.sidebar.session.next',
    () => {
      if (nextSidebarSession) onSelectSession(nextSidebarSession)
    },
    { enabled: Boolean(nextSidebarSession) },
  )
  useCommandHandler('workbench.settings.open', onOpenSettings)

  return (
    <>
      {Array.from({ length: 9 }, (_, index) => (
        <NumberedTabShortcut
          key={index}
          position={index + 1}
          session={tabSessions[index]}
          onSelectSession={onSelectSession}
        />
      ))}
    </>
  )
}
