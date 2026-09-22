import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/shadcn/toast'

import { ErrorBoundary } from '../../components/error-boundary'
import { ResizableSidebarProvider } from '../../components/resizable-sidebar'
import type { ClaudeProject } from '../../services/claude/claude'
import { ModelConfigurationProvider } from '../../stores/model-configuration-context'
import { ProviderUsageProvider } from '../../stores/provider-usage-context'
import { type SettingsCategoryId, SettingsPage } from '../settings'
import { LoadFailure, WorkbenchStartupFailure } from './components/loading-state'
import { ModelStartupBoundary } from './components/model-startup-boundary'
import { ProjectDialog } from './components/project-dialog'
import { type SessionAction, SessionActionDialogs } from './components/session-action-dialogs'
import { useSessionNavigation } from './hooks/use-session-navigation'
import { useWorkbench } from './hooks/use-workbench'
import { SessionArea, type SessionAreaProps } from './session'
import {
  SessionControllerRegistryProvider,
  useSessionControllerRegistry,
} from './session/session-controller-context'
import type { SessionError } from './session/stores/runtime-store'
import { WorkbenchShortcuts } from './shortcuts'
import { SessionSidebar } from './sidebar'
import type { WorkbenchSession } from './stores/workbench-store'
import { useWorkbenchStore } from './stores/workbench-store'

export function WorkbenchPage() {
  return (
    <ProviderUsageProvider>
      <ModelConfigurationProvider>
        <SessionControllerRegistryProvider>
          <WorkbenchContent />
        </SessionControllerRegistryProvider>
      </ModelConfigurationProvider>
    </ProviderUsageProvider>
  )
}

function WorkbenchContent() {
  const { t } = useTranslation()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategoryId>('general')
  const settingsReturnFocusRef = useRef<HTMLElement | null>(null)
  const workbenchFocusRef = useRef<HTMLDivElement>(null)
  const [sessionAction, setSessionAction] = useState<SessionAction | null>(null)
  const [projectDialog, setProjectDialog] = useState<{
    project?: ClaudeProject
    selectAfterSave: boolean
  } | null>(null)
  const sessionControllerRegistry = useSessionControllerRegistry()
  const handleSessionError = useCallback(
    (sessionId: string, error: SessionError | null) => {
      sessionControllerRegistry.find(sessionId)?.runtimeStore.setState({ runtimeError: error })
      if (error) useWorkbenchStore.getState().setSessionActivity(sessionId, 'error')
    },
    [sessionControllerRegistry],
  )
  const workbench = useWorkbench(handleSessionError, sessionControllerRegistry)
  const { refreshProjects } = workbench
  const touchDraftSession = useWorkbenchStore((state) => state.touchDraftSession)

  const openSettings = useCallback((category: SettingsCategoryId) => {
    const activeElement = document.activeElement
    settingsReturnFocusRef.current =
      activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null
    setSettingsCategory(category)
    setIsSettingsOpen(true)
  }, [])
  const handleOpenSettings = useCallback(() => openSettings('general'), [openSettings])
  const handleModelConfigurationRequired = useCallback(() => {
    toast.add({
      id: 'workbench-model-configuration-required',
      title: t('common.toast.cannotSend'),
      description: t('workbench.modelConfigurationRequired'),
      type: 'error',
    })
    openSettings('models')
  }, [openSettings, t])
  const {
    handleNavigate,
    handleSelectSession,
    handleStartNewSessionInCurrentWorkspace,
    handleSwitchWorkspace,
  } = useSessionNavigation(workbench)

  const handleRenameSession = useCallback((session: WorkbenchSession) => {
    setSessionAction({ kind: 'rename', sessionId: session.id })
  }, [])

  const handleDeleteSession = useCallback((session: WorkbenchSession) => {
    setSessionAction({ kind: 'delete', sessionId: session.id })
  }, [])

  const handleProjectSaved = useCallback(
    async (project: ClaudeProject) => {
      await refreshProjects()
      if (projectDialog?.selectAfterSave) handleSwitchWorkspace(project.id)
    },
    [handleSwitchWorkspace, projectDialog?.selectAfterSave, refreshProjects],
  )

  const isLocationAvailable = useCallback(
    ({ projectId, sessionId }: { projectId: string | null; sessionId: string | null }) => {
      const state = useWorkbenchStore.getState()
      if (sessionId) return Boolean(state.sessions[sessionId])
      return projectId ? Boolean(state.projects[projectId]) : true
    },
    [],
  )

  const handleRetryProjects = useCallback(() => {
    void refreshProjects().catch(() => {})
  }, [refreshProjects])

  const sessionAreaProps = {
    bindClaudeSession: workbench.bindClaudeSession,
    forkSession: workbench.forkSession,
    isMockProject: workbench.isMockProject,
    projectMode: workbench.projectMode,
    projectSessionError: workbench.selectedProject
      ? (workbench.projectSessionErrors[workbench.selectedProject.id] ?? null)
      : null,
    projects: workbench.projects,
    onSessionActivityChange: workbench.setSessionActivity,
    onPromptEdited: touchDraftSession,
    onRetryProjectSessions: handleRetryProjects,
    onSessionStarted: (sessionId: string) =>
      useWorkbenchStore.getState().markSessionStarted(sessionId),
    onSessionPromptRecalled: (sessionId: string) =>
      useWorkbenchStore.getState().markSessionDraft(sessionId),
    onProjectDefaultModelChange: workbench.saveProjectDefaultModel,
    onModelConfigurationRequired: handleModelConfigurationRequired,
    onAddProject: () => setProjectDialog({ selectAfterSave: true }),
    pinnedSessionIds: workbench.pinnedSessionIds,
    onCloseSession: workbench.closeSession,
    onDeleteSession: handleDeleteSession,
    onOpenSettings: handleOpenSettings,
    onRenameSession: handleRenameSession,
    onSelectSession: handleSelectSession,
    onStartNewSession: handleStartNewSessionInCurrentWorkspace,
    onTogglePinSession: workbench.togglePinSession,
    refreshProjects: workbench.refreshProjects,
    selectedProject: workbench.selectedProject,
    isProjectSessionLoading: workbench.selectedProject
      ? workbench.loadingProjectSessionIds.has(workbench.selectedProject.id)
      : false,
    selectedSession: workbench.selectedSession,
    selectPromptFiles: workbench.selectPromptFiles,
    sessionActivity: workbench.sessionActivity,
    tabSessions: workbench.tabSessions,
    workspaceSessions: workbench.workspaceSessions,
    setSelectedProjectId: handleSwitchWorkspace,
  } satisfies SessionAreaProps

  if (!workbench.hasLoadedCatalog && workbench.projectListError) {
    return <WorkbenchStartupFailure onRetry={handleRetryProjects} />
  }

  return (
    <ModelStartupBoundary
      isProjectCatalogLoaded={workbench.hasLoadedCatalog}
      isSdkWaitBypassed={workbench.isMockProject}
    >
      <ResizableSidebarProvider
        className="app-sidebar-layout session-sidebar-layout h-svh min-h-0 overflow-hidden bg-background text-foreground"
        ref={workbenchFocusRef}
        tabIndex={-1}
      >
        <ErrorBoundary
          fallback={(reset) => (
            <LoadFailure
              className="h-svh flex-1 rounded-none"
              description={t('workbench.boundary.surfaceDescription')}
              title={t('workbench.boundary.surfaceTitle')}
              onRetry={reset}
            />
          )}
        >
          <WorkbenchShortcuts
            currentLocation={{
              projectId:
                workbench.selectedSession?.project_id || workbench.selectedProject?.id || null,
              sessionId: workbench.selectedSession?.id ?? null,
            }}
            isLocationAvailable={isLocationAvailable}
            selectedSession={workbench.selectedSession}
            sidebarSessions={workbench.sessionList.map(({ session }) => session)}
            tabSessions={workbench.tabSessions}
            onCloseSession={workbench.closeSession}
            onNavigate={handleNavigate}
            onNewSession={handleStartNewSessionInCurrentWorkspace}
            onOpenSettings={handleOpenSettings}
            onSelectSession={handleSelectSession}
          />
          <SessionSidebar
            activeTab={workbench.activeTab}
            focusNavigationRevision={workbench.focusNavigationRevision}
            focusedSessionId={workbench.focusedSessionId}
            onTabChange={workbench.setActiveTab}
            selectedSession={workbench.selectedSession}
            sessionTimeline={workbench.activeTimeline}
            onDeleteSession={handleDeleteSession}
            onListKeyDown={workbench.handleListKeyDown}
            onOpenSettings={handleOpenSettings}
            onRenameSession={handleRenameSession}
            onSelectSession={handleSelectSession}
            onStartNewSession={handleStartNewSessionInCurrentWorkspace}
            onTogglePinSession={workbench.togglePinSession}
          />

          <SessionArea {...sessionAreaProps} />
        </ErrorBoundary>

        <SettingsPage
          error={workbench.projectListError}
          fallbackFocusRef={workbenchFocusRef}
          isProjectLoading={workbench.isLoading}
          initialCategory={settingsCategory}
          open={isSettingsOpen}
          projects={workbench.projects}
          returnFocusRef={settingsReturnFocusRef}
          onCreateProject={() => setProjectDialog({ selectAfterSave: false })}
          onEditProject={(project) => setProjectDialog({ project, selectAfterSave: false })}
          onOpenChange={setIsSettingsOpen}
          onReloadProjects={workbench.refreshProjects}
          onRemoveProject={(project) => workbench.removeProject(project.id)}
        />

        <ProjectDialog
          open={Boolean(projectDialog)}
          project={projectDialog?.project}
          onOpenChange={(open) => {
            if (!open) setProjectDialog(null)
          }}
          onSaved={handleProjectSaved}
        />

        <SessionActionDialogs
          action={sessionAction}
          onActionChange={setSessionAction}
          onDeleteSession={workbench.deleteSession}
          onRenameSession={workbench.renameSession}
        />
      </ResizableSidebarProvider>
    </ModelStartupBoundary>
  )
}
