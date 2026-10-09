import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { SidebarInset } from '@/shadcn/sidebar'
import { toast } from '@/shadcn/toast'
import { cn } from '@/shadcn/utils'

import { APP_CONTENT_CONTAINER_CLASS } from '../../../components/app-layout'
import { ErrorBoundary } from '../../../components/error-boundary'
import { TransientScrollArea } from '../../../components/transient-scroll-area'
import { useCommandHandler } from '../../../hooks/use-command-handler'
import type { ClaudeSlashCommand } from '../../../services/claude/claude'
import { projectDisplayName } from '../../../utils/project'
import { LoadFailure } from '../components/loading-state'
import { useModelStartupContext } from '../components/model-startup-boundary'
import { QuickOpenPanel } from '../quick-open'
import { useQuickOpenStore } from '../quick-open/quick-open-store'
import {
  type SessionActivity,
  type SessionActivityEvent,
  type WorkbenchProject,
  type WorkbenchSession,
} from '../stores/workbench-store'
import { sessionTitle } from '../utils/session-list'
import { ConversationView } from './conversation'
import { ConversationDock } from './conversation-dock'
import { ConversationHistorySkeleton } from './conversation-history-skeleton'
import { ConversationToc } from './conversation/conversation-toc'
import { latestTaskItems } from './conversation/task-items'
import { computeTurns } from './conversation/turns'
import type { VirtualConversationHandle } from './conversation/virtual-conversation'
import { SessionEmptyState } from './empty-state'
import { ConversationHeader } from './header'
import { ModelOnboarding } from './model-onboarding'
import type { PromptComposerBaseProps } from './prompt'
import { isUserPromptMessage } from './services/message'
import {
  SessionControllerProvider,
  useCatalogStore,
  useComposerStore,
  useConversationStore,
  useRuntimeStore,
  useSessionController,
  useUsageStore,
} from './session-controller-context'
import { sessionErrorKey } from './session-error'
import type { SessionComposerDraft } from './session-types'
import { averageCacheHitRate } from './stores/usage-store'
import { SubagentBreadcrumb } from './subagent-breadcrumb'
import { SubagentConversation } from './subagent-conversation'
import { useConversationAutoScroll } from './use-conversation-auto-scroll'
import { useConversationDock } from './use-conversation-dock'
import { useSessionAgents } from './use-session-agents'
import { useSessionModel } from './use-session-model'
import { useTaskProgress } from './use-task-progress'
import { WorkflowProvider } from './workflow-context'

export const CONVERSATION_BOTTOM_PADDING_CLASS = 'pb-72'
export const CONVERSATION_CONTAINER_CLASS = APP_CONTENT_CONTAINER_CLASS
const HISTORY_SKELETON_DELAY_MS = 300
const SUBAGENT_HEADER_HEIGHT = 44

/** A quick-open `:` selection asks the mounted conversation to scroll to a turn. */
type TurnScrollRequest = {
  revision: number
  turnId: string
}

export type SessionAreaProps = {
  onAddProject: () => void
  bindClaudeSession: (sessionId: string, claudeSessionId: string) => void
  forkSession: (session: WorkbenchSession, messageId: string) => Promise<void>
  isMockProject: boolean
  isProjectSessionLoading: boolean
  projectMode: 'project' | 'home'
  projectSessionError: string | null
  projects: WorkbenchProject[]
  pinnedSessionIds: ReadonlySet<string>
  onSessionActivityChange: (sessionId: string, activity: SessionActivityEvent) => void
  onPromptEdited: (sessionId: string) => void
  onProjectDefaultModelChange: (projectId: string, providerId: string, modelId: string) => void
  onModelConfigurationRequired: () => void
  onRetryProjectSessions: () => void
  onCloseSession: (session: WorkbenchSession) => void
  onDeleteSession: (session: WorkbenchSession) => void
  onOpenSettings: () => void
  onRenameSession: (session: WorkbenchSession) => void
  onSelectSession: (session: WorkbenchSession) => void
  onSessionStarted: (sessionId: string) => void
  onSessionPromptRecalled: (sessionId: string) => void
  onStartNewSession: (draft?: SessionComposerDraft) => void
  onTogglePinSession: (session: WorkbenchSession) => void
  refreshProjects: () => Promise<void>
  selectedProject?: WorkbenchProject
  selectedSession: WorkbenchSession | null
  selectPromptFiles: (startingFolder?: string) => Promise<string[]>
  sessionActivity: Record<string, SessionActivity>
  setSelectedProjectId: (projectId: string | null) => void
  tabSessions: WorkbenchSession[]
  workspaceSessions: WorkbenchSession[]
}

function sessionControllerProps(props: SessionAreaProps) {
  const { selectedProject, selectedSession } = props
  const sessionProject = selectedSession?.project_id
    ? props.projects.find((project) => project.id === selectedSession.project_id)
    : undefined
  const project = selectedSession ? sessionProject : selectedProject
  return {
    claudeSessionId: selectedSession?.claudeSessionId ?? null,
    isHomeMode: selectedSession ? !selectedSession.project_id : props.projectMode === 'home',
    isMockProject: props.isMockProject,
    projectId: selectedSession ? selectedSession.project_id || null : selectedProject?.id || null,
    projectPath: project?.path ?? selectedSession?.project_path ?? null,
    additionalDirectories: project?.additional_directories,
    sessionId: selectedSession?.id ?? '',
    sessionTitle: selectedSession?.title,
    defaultProviderId: project?.default_provider_id,
    defaultModelId: project?.default_model_id,
    onBindClaudeSession: props.bindClaudeSession,
    onActivityChange: props.onSessionActivityChange,
    onPromptEdited: props.onPromptEdited,
    onPromptStarted: props.onSessionStarted,
    onPromptRecalled: props.onSessionPromptRecalled,
    onStartNewSession: props.onStartNewSession,
    onProjectDefaultModelChange: props.onProjectDefaultModelChange,
    onModelConfigurationRequired: props.onModelConfigurationRequired,
    onRefreshCatalog: props.refreshProjects,
  }
}

export function SessionArea(props: SessionAreaProps) {
  const { t } = useTranslation()
  const { selectedProject, selectedSession } = props
  const sessionId = selectedSession?.id ?? ''
  const [contentScroll, setContentScroll] = useState({ sessionId, isScrolled: false })
  const isContentScrolled = contentScroll.sessionId === sessionId ? contentScroll.isScrolled : false
  const handleContentScrolledChange = useCallback((nextSessionId: string, isScrolled: boolean) => {
    setContentScroll((current) =>
      current.sessionId === nextSessionId && current.isScrolled === isScrolled
        ? current
        : { sessionId: nextSessionId, isScrolled },
    )
  }, [])
  const quickOpenOpen = useQuickOpenStore((state) => state.quickOpenOpen)
  const openQuickOpen = useQuickOpenStore((state) => state.openQuickOpen)
  const closeQuickOpen = useQuickOpenStore((state) => state.closeQuickOpen)
  const [turnScrollRequest, setTurnScrollRequest] = useState<TurnScrollRequest | null>(null)
  const turnScrollRevisionRef = useRef(0)
  const handleScrollToMessage = useCallback((turnId: string) => {
    turnScrollRevisionRef.current += 1
    setTurnScrollRequest({ revision: turnScrollRevisionRef.current, turnId })
  }, [])

  // The legacy picker dialogs are gone: their shortcuts now open the quick
  // switcher with the matching mode prefix pre-filled.
  useCommandHandler('workbench.picker.project.open', () => openQuickOpen('~'))
  useCommandHandler('workbench.picker.session.open', () => openQuickOpen('@'))
  useCommandHandler('workbench.picker.allSessions.open', () => openQuickOpen('#'))
  useCommandHandler('workbench.picker.sentMessages.open', () => openQuickOpen(':'))
  useCommandHandler('workbench.picker.quick.open', openQuickOpen)

  return (
    <SidebarInset className="relative min-w-0 overflow-hidden bg-background">
      <ConversationHeader
        activeSessionId={selectedSession?.id ?? null}
        historyError={props.projectSessionError}
        historyIsLoading={props.isProjectSessionLoading}
        historySessions={props.workspaceSessions}
        isContentScrolled={isContentScrolled}
        projectMode={props.projectMode}
        projectName={selectedProject ? projectDisplayName(selectedProject) : ''}
        projects={props.projects}
        pinnedSessionIds={props.pinnedSessionIds}
        selectedProject={selectedProject}
        sessionActivity={props.sessionActivity}
        sessions={props.tabSessions}
        onAddProject={props.onAddProject}
        onCloseSession={props.onCloseSession}
        onDeleteSession={props.onDeleteSession}
        onRenameSession={props.onRenameSession}
        onSelectProject={props.setSelectedProjectId}
        onSelectSession={props.onSelectSession}
        onRetryHistory={props.onRetryProjectSessions}
        onTogglePinSession={props.onTogglePinSession}
      />

      <ErrorBoundary
        resetKeys={[sessionId]}
        fallback={(reset) => (
          <LoadFailure
            className="min-h-0 flex-1 rounded-none"
            description={t('workbench.boundary.sessionDescription')}
            title={t('workbench.boundary.sessionTitle')}
            onRetry={reset}
          />
        )}
      >
        {selectedProject && props.projectSessionError && !selectedSession ? (
          <LoadFailure
            className="min-h-0 flex-1 rounded-none"
            description={t('workbench.loading.projectSessionsFailed')}
            isRetrying={props.isProjectSessionLoading}
            title={t('workbench.loading.projectSessionsFailedTitle')}
            onRetry={props.onRetryProjectSessions}
          />
        ) : !selectedSession ? (
          <div className="flex flex-1 items-center justify-center">
            <div
              data-empty-new-chat
              className="cursor-pointer rounded-lg border px-5 py-3"
              onClick={() => props.onStartNewSession()}
            >
              {t('workbench.session.new')}
            </div>
          </div>
        ) : (
          <ModelOnboardingGate {...props}>
            <SessionControllerProvider key={sessionId} {...sessionControllerProps(props)}>
              <SessionAreaContent
                {...props}
                selectedSession={selectedSession}
                sessionId={sessionId}
                turnScrollRequest={turnScrollRequest}
                onContentScrolledChange={handleContentScrolledChange}
              />
            </SessionControllerProvider>
          </ModelOnboardingGate>
        )}
      </ErrorBoundary>
      {/* The quick-open palette mounts once here; the picker commands open it
          through the quick-open store, pre-filled with their mode prefix. */}
      <QuickOpenPanel
        open={quickOpenOpen}
        projects={props.projects}
        sessionActivity={props.sessionActivity}
        onOpenChange={(isOpen) => (isOpen ? openQuickOpen() : closeQuickOpen())}
        onScrollToMessage={handleScrollToMessage}
        onSelectProject={props.setSelectedProjectId}
        onSelectSession={props.onSelectSession}
      />
    </SidebarInset>
  )
}

function ModelOnboardingGate({
  children,
  isMockProject,
}: Pick<SessionAreaProps, 'isMockProject'> & { children: ReactNode }) {
  const { dismissModelOnboarding, shouldShowModelOnboarding } = useModelStartupContext()

  if (isMockProject || !shouldShowModelOnboarding) return children

  return <ModelOnboarding onSkip={dismissModelOnboarding} onComplete={dismissModelOnboarding} />
}

function SessionAreaContent({
  forkSession,
  isMockProject,
  isProjectSessionLoading,
  projectMode,
  projectSessionError,
  projects,
  sessionId,
  selectedProject,
  selectedSession,
  selectPromptFiles,
  sessionActivity,
  tabSessions,
  workspaceSessions,
  turnScrollRequest,
  onAddProject,
  onContentScrolledChange,
  onOpenSettings,
  onRenameSession,
  onSelectSession,
  onRetryProjectSessions,
  setSelectedProjectId,
}: SessionAreaProps & {
  sessionId: string
  turnScrollRequest: TurnScrollRequest | null
  onContentScrolledChange: (sessionId: string, isScrolled: boolean) => void
}) {
  const { t } = useTranslation()
  const controller = useSessionController()
  const availableCommands = useCatalogStore((state) => state.availableCommands)
  const { attachments, permissionMode, pendingMessage, prompt } = useComposerStore(
    useShallow((state) => ({
      attachments: state.attachments,
      permissionMode: state.permissionMode,
      pendingMessage: state.pendingMessage,
      prompt: state.prompt,
    })),
  )
  const {
    expandedTurns,
    interruptedTurnDurations,
    interruptedTurnIds,
    messageIds,
    messageMap,
    sentTurnIds,
    turnFailures,
  } = useConversationStore(
    useShallow((state) => ({
      expandedTurns: state.expandedTurns,
      interruptedTurnDurations: state.interruptedTurnDurations,
      interruptedTurnIds: state.interruptedTurnIds,
      messageIds: state.messageIds,
      messageMap: state.messages,
      sentTurnIds: state.sentTurnIds,
      turnFailures: state.turnFailures,
    })),
  )
  const {
    isHistoryLoading,
    isMessageEditPending,
    messageEditDraft,
    isSubmitting,
    isStreaming,
    pendingToolRequests,
    runtimeError,
    runtimeStatus,
    streamingElapsed,
  } = useRuntimeStore(
    useShallow((state) => ({
      isHistoryLoading: state.isHistoryLoading,
      isMessageEditPending: state.isMessageEditPending,
      messageEditDraft: state.messageEditDraft,
      isSubmitting: state.isSubmitting,
      isStreaming: state.isStreaming,
      pendingToolRequests: state.pendingToolRequests,
      runtimeError: state.runtimeError,
      runtimeStatus: state.runtimeStatus,
      streamingElapsed: state.streamingElapsed,
    })),
  )
  const usageSnapshot = useUsageStore((state) => state.snapshot)
  const isSamplingContextUsage = useUsageStore((state) => state.isSampling)
  const cacheHitRate = useUsageStore((state) => averageCacheHitRate(state))
  const {
    cancelMessageEdit,
    deletePendingMessage,
    editPendingMessage,
    prepareMessageEdit,
    queuePendingMessage,
    resumeInterrupted,
    retryInitialize,
    respondToolRequest,
    sendPrompt,
    setAttachments,
    setPermissionMode,
    setPrompt,
    setSelectedProviderModel,
    stopStreaming,
    submitMessageEdit,
    toggleTurn,
  } = controller

  const {
    model,
    modelOptions,
    providerId: currentProviderId,
    selectedLabel: selectedModelLabel,
  } = useSessionModel()
  const messages = useMemo(
    () => messageIds.flatMap((id) => (messageMap[id] ? [messageMap[id]] : [])),
    [messageIds, messageMap],
  )
  const rootMessages = useMemo(
    () => messages.filter((message) => !message.parentToolUseId),
    [messages],
  )
  // Sent prompts for the composer's arrow-key history recall, oldest first.
  const sentPrompts = useMemo(
    () =>
      rootMessages
        .filter(
          (message) =>
            !message.isMeta && isUserPromptMessage(message) && Boolean(message.content.trim()),
        )
        .map((message) => message.content),
    [rootMessages],
  )
  const sessionProject = selectedSession?.project_id
    ? projects.find((project) => project.id === selectedSession.project_id)
    : undefined
  const activeProject = selectedSession ? sessionProject : selectedProject
  const projectId = activeProject?.id
  const projectPath = activeProject?.path ?? selectedSession?.project_path
  const { activeMessages, activeViewKey, subagentView, workflowGroups, workflowView } =
    useSessionAgents({
      claudeSessionId: selectedSession?.claudeSessionId ?? undefined,
      isActive: Boolean(selectedSession),
      isMockProject,
      messages,
      projectId,
      rootMessages,
    })
  const turns = useMemo(() => computeTurns(rootMessages), [rootMessages])
  const lastTurn = turns.at(-1)
  // The latest turn was stopped after content had streamed: an empty composer
  // offers the resume (play) action instead of a plain send.
  const canResumeInterrupted = Boolean(
    !isStreaming &&
    !isSubmitting &&
    !isHistoryLoading &&
    !isMessageEditPending &&
    !isMockProject &&
    selectedSession?.claudeSessionId &&
    lastTurn &&
    (lastTurn.isInterrupted === true || interruptedTurnIds.has(lastTurn.userMessage.id)) &&
    lastTurn.assistantMessages.length > 0,
  )
  const taskItems = useMemo(
    () => latestTaskItems(turns.flatMap((turn) => turn.timelineItems)),
    [turns],
  )
  const taskProgress = useTaskProgress({
    messages: activeMessages,
    taskItems,
    subagents: subagentView.subagents,
    workflowGroups,
  })
  const askRequests = useMemo(
    () => Object.values(pendingToolRequests).filter((request) => request.kind === 'ask'),
    [pendingToolRequests],
  )
  const dockMode = !subagentView.selectedSubagent && askRequests.length ? 'ask' : 'prompt'
  const { bottomPadding, dockRef, scrollVersion: dockScrollVersion } = useConversationDock(dockMode)
  const contextUsage = usageSnapshot
    ? {
        usedTokens: usageSnapshot.totalTokens,
        maxTokens: usageSnapshot.maxTokens,
        percent: usageSnapshot.percentage,
      }
    : null
  const canSendPrompt =
    Boolean(prompt?.trim() || attachments?.length) &&
    !isSubmitting &&
    !isStreaming &&
    !isMessageEditPending &&
    !isMockProject &&
    (projectMode === 'home' || Boolean(selectedProject))
  // Runtime errors surface as a toast instead of a composer footnote; the
  // fixed id keeps a re-labelled follow-up (message-send → message-edit)
  // replacing the first toast rather than stacking a second one.
  useEffect(() => {
    if (!runtimeError || runtimeError.kind === 'session-initialize') return
    toast.add({
      id: 'workbench-session-error',
      title: t(sessionErrorKey(runtimeError.kind)),
      description: runtimeError.message,
      type: 'error',
    })
  }, [runtimeError, t])
  const [virtualContentSize, setVirtualContentSize] = useState({ size: 0, viewKey: activeViewKey })
  const activeVirtualContentSize =
    virtualContentSize.viewKey === activeViewKey ? virtualContentSize.size : 0
  // Primitive fields only: the version must keep its identity across streaming
  // publishes (they rerender without changing any of these), or the auto-scroll
  // effect rewrites scrollTop per frame and fights the virtualizer's own
  // at-bottom adjustments. Content growth lands in activeVirtualContentSize.
  const autoScrollVersion = useMemo(
    () => [activeMessages.length, activeVirtualContentSize, dockScrollVersion] as const,
    [activeMessages.length, activeVirtualContentSize, dockScrollVersion],
  )
  const virtualConversationRef = useRef<VirtualConversationHandle>(null)
  // A quick-open `:` pick scrolls the mounted conversation to that turn; the
  // revision keeps repeat picks of the same turn re-triggering the effect.
  useEffect(() => {
    if (!turnScrollRequest) return
    virtualConversationRef.current?.scrollToTurn(turnScrollRequest.turnId)
  }, [turnScrollRequest])
  const { isContentScrolled, pauseAutoScroll, resetAutoScroll, viewportRef } =
    useConversationAutoScroll(autoScrollVersion, activeViewKey, virtualConversationRef)
  const [conversationViewport, setConversationViewport] = useState<HTMLDivElement | null>(null)
  const [visibleTurnIds, setVisibleTurnIds] = useState<Set<string>>(() => new Set())
  const [isHistorySkeletonVisible, setHistorySkeletonVisible] = useState(false)
  useEffect(() => {
    if (!isHistoryLoading) {
      setHistorySkeletonVisible(false)
      return
    }

    const timer = window.setTimeout(
      () => setHistorySkeletonVisible(true),
      HISTORY_SKELETON_DELAY_MS,
    )
    return () => window.clearTimeout(timer)
  }, [isHistoryLoading])
  useEffect(() => {
    onContentScrolledChange(sessionId, isContentScrolled)
  }, [isContentScrolled, onContentScrolledChange, sessionId])
  const handleViewportRef = useCallback(
    (element: HTMLDivElement | null) => {
      viewportRef(element)
      setConversationViewport((current) => (current === element ? current : element))
    },
    [viewportRef],
  )
  const handleVirtualContentSizeChange = useCallback(
    (size: number) => {
      setVirtualContentSize((current) =>
        current.viewKey === activeViewKey && current.size === size
          ? current
          : { size, viewKey: activeViewKey },
      )
    },
    [activeViewKey],
  )
  const handleSelectTurn = useCallback((turnId: string) => {
    virtualConversationRef.current?.scrollToTurn(turnId)
  }, [])
  const handleVisibleTurnIdsChange = useCallback((next: Set<string>) => {
    setVisibleTurnIds((current) => {
      if (current.size === next.size && [...current].every((id) => next.has(id))) return current
      return next
    })
  }, [])
  const handleToggleTurn = useCallback(
    (turnId: string) => {
      pauseAutoScroll()
      toggleTurn(turnId)
    },
    [pauseAutoScroll, toggleTurn],
  )

  function handleSubmit() {
    resetAutoScroll()
    if (selectedSession) {
      void sendPrompt()
      return
    }
    void controller.sendPrompt()
  }

  function handleResume() {
    resetAutoScroll()
    void resumeInterrupted()
  }

  const canForkSession = Boolean(
    !isMockProject && selectedSession?.claudeSessionId && selectedSession.project_id,
  )
  const handleFork = useCallback(
    (messageId: string) =>
      selectedSession ? forkSession(selectedSession, messageId) : Promise.resolve(),
    [forkSession, selectedSession],
  )
  const messageEdit = useMemo(
    () =>
      !isMockProject &&
      selectedSession?.claudeSessionId &&
      selectedSession.project_id &&
      currentProviderId &&
      model
        ? {
            draft: messageEditDraft,
            availableCommands,
            modelOptions,
            permissionMode,
            projectPath,
            selectedModelId: model,
            selectedProviderId: currentProviderId,
            onPrepare: prepareMessageEdit,
            onCancelPreparation: cancelMessageEdit,
            onSelectFiles: selectPromptFiles,
            onSubmit: submitMessageEdit,
          }
        : undefined,
    [
      messageEditDraft,
      availableCommands,
      currentProviderId,
      cancelMessageEdit,
      isMockProject,
      model,
      modelOptions,
      permissionMode,
      prepareMessageEdit,
      selectPromptFiles,
      projectPath,
      selectedSession,
      submitMessageEdit,
    ],
  )

  const promptComposerProps: PromptComposerBaseProps = {
    attachments,
    availableCommands,
    canSubmit: canSendPrompt,
    canUsePrompt: projectMode === 'home' || Boolean(selectedProject),
    canRefreshSession:
      Boolean(selectedSession?.claudeSessionId) &&
      !isHistoryLoading &&
      !isStreaming &&
      !isSubmitting &&
      !isMessageEditPending &&
      !isMockProject,
    contextUsage,
    isSamplingContext: isSamplingContextUsage,
    contextUsageDetail: selectedSession?.claudeSessionId
      ? {
          snapshot: usageSnapshot,
          averageCacheHitRate: cacheHitRate,
          onOpen: () => void controller.sendService.fetchContextUsage(),
        }
      : undefined,
    isMockProject,
    isSubmitting,
    isStreaming,
    model,
    modelOptions,
    onDeletePendingMessage: deletePendingMessage,
    onEditPendingMessage: editPendingMessage,
    onQueuePendingMessage: () => {
      queuePendingMessage()
    },
    pendingMessage,
    permissionMode,
    prompt,
    projectPath,
    selectedModelLabel,
    selectedProviderId: currentProviderId,
    sentPrompts,
    setSelectedProviderModel,
    setPermissionMode,
    setPrompt,
    setAttachments,
    onSelectFiles: selectPromptFiles,
    onRunCommand: (command: ClaudeSlashCommand) => {
      const commandName = command.name.replace(/^\/+/, '').trim()
      switch (commandName) {
        case 'config':
          onOpenSettings()
          return
        case 'compact':
          if (!selectedSession?.claudeSessionId) return
          void controller.sendService.sendSlashCommand(commandName)
          return
        case 'context':
          return
        case 'rename':
          if (selectedSession) onRenameSession(selectedSession)
          return
        default:
          void controller.sendService.sendSlashCommand(commandName)
      }
    },
    onStop: stopStreaming,
    onSubmit: handleSubmit,
    onRefreshSession: () => {
      void controller.reloadHistory()
    },
    canResume: canResumeInterrupted,
    onResume: handleResume,
  }

  if (runtimeError?.kind === 'session-initialize' && selectedSession && !messages.length) {
    return (
      <LoadFailure
        className="min-h-0 flex-1 rounded-none"
        description={t('workbench.loading.sessionFailed')}
        isRetrying={runtimeStatus === 'loading'}
        title={t('workbench.loading.sessionFailedTitle')}
        onRetry={() => void retryInitialize()}
      />
    )
  }

  return (
    <>
      {isHistoryLoading || messages.length ? (
        <>
          <div className="relative min-h-0 flex-1">
            {!isHistoryLoading && subagentView.selectedSubagent ? (
              <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center bg-background px-4">
                <SubagentBreadcrumb
                  current={subagentView.selectedSubagent}
                  sessionTitle={
                    selectedSession ? sessionTitle(selectedSession) : t('workbench.session.label')
                  }
                  subagents={subagentView.subagents}
                  workflows={subagentView.workflows}
                  onBack={subagentView.closeSubagent}
                  onSelect={subagentView.selectSubagent}
                />
              </div>
            ) : null}
            {/* select-text sits on the scroll root, not the content column, so
                drags starting in blank margins and gaps can select text; the
                scrollbar opt-outs via transient-scroll-area.css. */}
            <TransientScrollArea
              className="size-full select-text"
              viewportRef={handleViewportRef}
              viewportProps={{ tabIndex: -1 }}
            >
              <div
                className={cn(
                  CONVERSATION_CONTAINER_CLASS,
                  'flex min-h-full flex-col',
                  subagentView.selectedSubagent
                    ? taskProgress.hasTaskProgress
                      ? 'pb-20 pt-11'
                      : 'pb-4 pt-11'
                    : CONVERSATION_BOTTOM_PADDING_CLASS,
                )}
                style={subagentView.selectedSubagent ? undefined : { paddingBottom: bottomPadding }}
              >
                <ErrorBoundary
                  resetKeys={[activeViewKey]}
                  fallback={(reset) => (
                    <LoadFailure
                      className="py-24"
                      description={t('workbench.boundary.conversationDescription')}
                      title={t('workbench.boundary.conversationTitle')}
                      onRetry={reset}
                    />
                  )}
                >
                  {isHistoryLoading && isHistorySkeletonVisible ? (
                    <ConversationHistorySkeleton />
                  ) : !isHistoryLoading && subagentView.selectedSubagent ? (
                    <SubagentConversation
                      error={subagentView.error}
                      isLoading={subagentView.isLoading}
                      messages={subagentView.selectedMessages}
                      pendingRequests={pendingToolRequests}
                      projectPath={projectPath}
                      status={subagentView.selectedSubagent.status}
                      scrollMargin={SUBAGENT_HEADER_HEIGHT}
                      viewport={conversationViewport}
                      viewKey={activeViewKey}
                      virtualListRef={virtualConversationRef}
                      onOpenSubagent={subagentView.openSubagent}
                      onRespond={respondToolRequest}
                      onRetry={subagentView.retry}
                      onTotalSizeChange={handleVirtualContentSizeChange}
                    />
                  ) : !isHistoryLoading ? (
                    <WorkflowProvider
                      refs={workflowView.refs}
                      runs={workflowView.runs}
                      onOpenAgent={subagentView.openWorkflowSubagent}
                    >
                      <ConversationView
                        expandedTurns={expandedTurns}
                        isStreaming={isStreaming}
                        messageEdit={messageEdit}
                        messages={rootMessages}
                        onFork={canForkSession ? handleFork : undefined}
                        onOpenSubagent={subagentView.openSubagent}
                        pendingRequests={pendingToolRequests}
                        projectPath={projectPath}
                        sentTurnIds={sentTurnIds}
                        interruptedTurnIds={interruptedTurnIds}
                        interruptedTurnDurations={interruptedTurnDurations}
                        streamingElapsed={streamingElapsed}
                        turnFailures={turnFailures}
                        turns={turns}
                        viewport={conversationViewport}
                        viewKey={activeViewKey}
                        virtualListRef={virtualConversationRef}
                        onRespond={respondToolRequest}
                        onTotalSizeChange={handleVirtualContentSizeChange}
                        onToggle={handleToggleTurn}
                        onVisibleTurnIdsChange={handleVisibleTurnIdsChange}
                      />
                    </WorkflowProvider>
                  ) : null}
                </ErrorBoundary>
              </div>
            </TransientScrollArea>
            {!isHistoryLoading && !subagentView.selectedSubagent ? (
              <ConversationToc
                turns={turns}
                viewport={conversationViewport}
                visibleTurnIds={visibleTurnIds}
                onSelectTurn={handleSelectTurn}
              />
            ) : null}
          </div>

          <ConversationDock
            askRequests={askRequests}
            composerProps={promptComposerProps}
            dockRef={dockRef}
            isSubagentSelected={Boolean(subagentView.selectedSubagent)}
            taskProgress={taskProgress}
            onOpenWorkflowAgent={subagentView.openWorkflowSubagent}
            onRespond={respondToolRequest}
          />
        </>
      ) : (
        <SessionEmptyState
          activeSessionId={selectedSession?.id ?? null}
          composerProps={promptComposerProps}
          hasTabSessions={tabSessions.length > 0}
          historyError={projectSessionError}
          historyIsLoading={isProjectSessionLoading}
          historySessions={workspaceSessions}
          projectMode={projectMode}
          projectName={selectedProject ? projectDisplayName(selectedProject) : ''}
          projects={projects}
          selectedProject={selectedProject}
          sessionActivity={sessionActivity}
          onAddProject={onAddProject}
          onSelectProject={setSelectedProjectId}
          onSelectSession={onSelectSession}
          onRetryHistory={onRetryProjectSessions}
        />
      )}
    </>
  )
}
