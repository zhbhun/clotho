import { loadDefaultPermissionMode } from '../../../services/app-settings'
import { claude } from '../../../services/claude/claude'
import type {
  ClaudeContextUsageSnapshot,
  ClaudePermissionMode,
  ClaudeSessionEditAnchor,
  ClaudeToolResult,
} from '../../../services/claude/claude'
import { getLogger } from '../../../services/logging'
import { createModelConfigurationStore } from '../../../stores/model-configuration-store'
import { sessionPersistence } from '../services/session-persistence'
import type { AttachmentUpdate } from './services/attachments'
import { CatalogService } from './services/catalog-service'
import { ComposerService } from './services/composer-service'
import { FollowService } from './services/follow-service'
import { HistoryService } from './services/history-service'
import type { ClaudeMessage } from './services/message'
import { MessageEditService } from './services/message-edit-service'
import { SendService } from './services/send-service'
import { UsageSampler } from './services/usage-sampler'
import type { MessageEditDraft, SessionContext, SessionControllerOptions } from './session-types'
import { createCatalogStore } from './stores/catalog-store'
import { createComposerStore } from './stores/composer-store'
import { createSessionContextStore } from './stores/context-store'
import { createConversationStore } from './stores/conversation-store'
import { createRuntimeStore } from './stores/runtime-store'
import { createDefaultPreferences, sanitizeSessionPreferences } from './stores/session-preferences'
import { createUsageStore } from './stores/usage-store'

function sessionContextFromOptions(options: SessionControllerOptions): SessionContext {
  return {
    claudeSessionId: options.claudeSessionId,
    projectId: options.projectId,
    projectPath: options.projectPath,
    additionalDirectories: options.additionalDirectories,
    sessionTitle: options.sessionTitle,
    defaultProviderId: options.defaultProviderId,
    defaultModelId: options.defaultModelId,
    isHomeMode: options.isHomeMode,
    isMockProject: options.isMockProject,
  }
}

export class SessionController {
  private readonly logger = getLogger('session')
  readonly claudeService
  readonly persistenceService
  readonly getDefaultPermissionMode

  readonly contextStore
  readonly composerStore
  readonly conversationStore
  readonly runtimeStore
  readonly usageStore
  readonly catalogStore
  readonly modelConfigurationStore

  readonly composerService
  readonly catalogService
  readonly historyService
  readonly sendService
  readonly usageSampler
  readonly followService
  readonly messageEditService

  readonly options: SessionControllerOptions

  private initializePromise: Promise<void> | null = null
  private hydratePromise: Promise<void> | null = null
  private historyPromise: Promise<void> | null = null
  private catalogPromise: Promise<void> | null = null
  private sendPromise: Promise<boolean | void> | null = null
  private hasLoadedHistory: boolean
  private disposed = false
  private readonly unsubscribeUsageSnapshot: () => void

  constructor(options: SessionControllerOptions) {
    this.options = { ...options }
    this.claudeService = options.client ?? claude
    this.persistenceService = options.persistence ?? sessionPersistence
    this.getDefaultPermissionMode = options.getDefaultPermissionMode ?? loadDefaultPermissionMode

    const context = sessionContextFromOptions(options)
    const storedPreferences = this.persistenceService.get(options.sessionId)?.composer
    const preferences = storedPreferences
      ? sanitizeSessionPreferences(storedPreferences, this.getDefaultPermissionMode())
      : createDefaultPreferences(this.getDefaultPermissionMode)

    this.contextStore = createSessionContextStore(options.sessionId, context)
    this.composerStore = createComposerStore(preferences)
    this.conversationStore = createConversationStore()
    this.runtimeStore = createRuntimeStore(options.claudeSessionId)
    this.usageStore = createUsageStore()
    this.catalogStore = createCatalogStore()
    this.modelConfigurationStore =
      options.modelConfigurationStore ?? createModelConfigurationStore()

    this.composerService = new ComposerService(this)
    this.catalogService = new CatalogService(this)
    this.historyService = new HistoryService(this)
    this.sendService = new SendService(this)
    this.usageSampler = new UsageSampler(this)
    this.followService = new FollowService(this)
    this.messageEditService = new MessageEditService(this)
    // Persist every real snapshot change (sample, /clear reset) so reopening
    // the session can restore the usage ring without a live query.
    this.unsubscribeUsageSnapshot = this.usageStore.subscribe((current, previous) => {
      if (current.snapshot === previous.snapshot) return
      this.persistContextUsageSnapshot(current.snapshot)
    })
    this.hasLoadedHistory = !options.claudeSessionId
  }

  get isDisposed() {
    return this.disposed
  }

  syncOptions(options: SessionControllerOptions) {
    Object.assign(this.options, options)
    this.syncContext(sessionContextFromOptions(this.options))
  }

  syncContext = (context: SessionContext) => {
    this.contextStore.getState().syncContext(context)
    this.followService.sync()
  }

  private persistContextUsageSnapshot(snapshot: ClaudeContextUsageSnapshot | null) {
    const context = this.contextStore.getState()
    const composer = this.composerService.snapshot()
    void this.persistenceService
      .update(context.sessionId, (record) => ({
        ...(record ?? { id: context.sessionId, composer }),
        // The stored record's association wins over the in-memory context,
        // which can still be mid-hydration; the context only seeds identity
        // fields when this write creates the local file.
        projectId: record?.projectId ?? context.projectId,
        projectPath: record?.projectPath ?? context.projectPath,
        claudeSessionId: record?.claudeSessionId ?? context.claudeSessionId,
        contextUsage: snapshot
          ? { snapshot, anchorMessageId: this.historyService.usageAnchorId }
          : undefined,
      }))
      .catch((error: unknown) =>
        this.logger.error('session.usage_persist_failed', 'Failed to persist the usage snapshot', {
          error,
        }),
      )
  }

  private startCatalogInitialization() {
    if (this.catalogPromise || this.contextStore.getState().isMockProject) return
    const promise = this.catalogService.initialize()
    this.catalogPromise = promise
    void promise.catch(() => {
      if (this.catalogPromise === promise) this.catalogPromise = null
    })
  }

  private startHistoryLoad(
    errorKind: 'session-initialize' | 'session-reload' = 'session-initialize',
    loadHistory: () => Promise<void> = () => this.historyService.load(),
  ) {
    if (this.hasLoadedHistory) return Promise.resolve()
    if (this.historyPromise) return this.historyPromise

    const context = this.contextStore.getState()
    this.runtimeStore.setState({
      runtimeStatus: 'loading',
      runtimeCwd: context.isHomeMode ? null : context.projectPath,
      runtimeResume: context.claudeSessionId,
      runtimeError: null,
      isHistoryLoading: true,
    })
    const promise = loadHistory()
      .then(() => {
        if (this.disposed) return
        this.hasLoadedHistory = true
        this.runtimeStore.setState({
          isHistoryLoading: false,
          runtimeStatus: 'ready',
          runtimeError: null,
        })
      })
      .catch((caught) => {
        if (!this.disposed) {
          this.runtimeStore.setState({
            isHistoryLoading: false,
            runtimeStatus: 'error',
            runtimeError: {
              kind: errorKind,
              message:
                caught instanceof Error
                  ? caught.message
                  : errorKind === 'session-reload'
                    ? 'Failed to reload Claude session'
                    : 'Failed to initialize Claude session',
            },
          })
        }
        throw caught
      })
    this.historyPromise = promise
    void promise.catch(() => {})
    return promise
  }

  reloadHistory = (ready: Promise<void> = Promise.resolve()) => {
    if (!this.hasLoadedHistory && this.historyPromise) return this.historyPromise
    this.hasLoadedHistory = false
    this.historyPromise = null
    return this.startHistoryLoad('session-reload', async () => {
      await ready
      if (this.disposed) return
      await this.historyService.load()
    })
  }

  initialize = () => {
    if (this.initializePromise) return this.initializePromise
    // Enter the loading state only when there is history to fetch. A fresh
    // draft has none, and the loading flip swaps the composer between the dock
    // and the empty state — a remount that eats in-flight pointer presses.
    // (If hydration below discovers a persisted binding, startHistoryLoad
    // raises the loading state itself.)
    if (!this.hasLoadedHistory) {
      this.runtimeStore.setState({ isHistoryLoading: true, runtimeStatus: 'loading' })
    }
    if (!this.hydratePromise) {
      const inputBeforeLoad = this.composerStore.getState()
      this.hydratePromise = this.persistenceService.load(this.options.sessionId).then((record) => {
        if (!record || this.disposed) return
        if (this.composerStore.getState() === inputBeforeLoad)
          this.composerStore.setState({
            ...record.composer,
            attachments: record.composer.attachments ?? [],
          })
        if (!this.contextStore.getState().claudeSessionId && record.claudeSessionId) {
          this.contextStore.setState({ claudeSessionId: record.claudeSessionId })
          this.runtimeStore.setState({ runtimeResume: record.claudeSessionId })
          this.hasLoadedHistory = false
        }
      })
    }
    const context = this.contextStore.getState()
    if (context.isMockProject && this.hasLoadedHistory) {
      this.hasLoadedHistory = false
      this.historyPromise = null
    }
    this.startCatalogInitialization()
    const promise = this.hydratePromise
      .then(async () => {
        await this.startHistoryLoad()
        if (!this.disposed)
          this.runtimeStore.setState({ isHistoryLoading: false, runtimeStatus: 'ready' })
      })
      .catch((error) => {
        this.runtimeStore.setState({
          isHistoryLoading: false,
          runtimeStatus: 'error',
          runtimeError: { kind: 'session-initialize', message: String(error) },
        })
      })
    this.initializePromise = promise
    if (context.isMockProject) {
      void promise.then(() => {
        if (this.initializePromise !== promise) return
        this.initializePromise = null
        this.historyPromise = null
      })
    }
    return promise
  }

  retryInitialize = () => {
    this.initializePromise = null
    this.historyPromise = null
    this.hydratePromise = null
    return this.initialize()
  }

  activate = () => this.followService.activate()

  deactivate = () => this.followService.deactivate()

  private trackSend(promise: Promise<boolean | void>) {
    this.sendPromise = promise
    const release = () => {
      if (this.sendPromise === promise) this.sendPromise = null
    }
    void promise.then(release, release)
    return promise
  }

  private submitAfterHistory(send: () => Promise<boolean | void>) {
    if (this.sendPromise) return this.sendPromise
    if (this.hasLoadedHistory) return this.trackSend(send())

    this.runtimeStore.setState({ isSubmitting: true })
    const promise = (async () => {
      try {
        await this.startHistoryLoad()
      } catch {
        if (!this.disposed) this.runtimeStore.setState({ isSubmitting: false })
        return
      }
      try {
        if (this.disposed) return
        return await send()
      } finally {
        if (!this.disposed && this.runtimeStore.getState().isSubmitting) {
          this.runtimeStore.setState({ isSubmitting: false })
        }
      }
    })()
    return this.trackSend(promise)
  }

  sendPrompt = () => this.submitAfterHistory(() => this.sendService.sendPrompt())

  resumeInterrupted = () => this.submitAfterHistory(() => this.sendService.resumeInterrupted())

  stopStreaming = () => this.sendService.stop()

  ingestLine = (line: string) => this.sendService.ingestLine(line)

  ingestError = (line: string) => this.historyService.ingestError(line)

  commitUserMessage = (message: ClaudeMessage) => this.historyService.commitUserMessage(message)

  resetConversation = () => this.historyService.resetConversation()

  toggleTurn = (turnId: string) => this.conversationStore.getState().toggleTurn(turnId)

  refreshModels = () => this.catalogService.refreshModels()

  setPrompt = (prompt: string) => this.composerService.setPrompt(prompt)

  setAttachments = (update: AttachmentUpdate) => this.composerService.setAttachments(update)

  setSelectedProviderModel = (providerId: string, modelId: string) =>
    this.composerService.setSelectedProviderModel(providerId, modelId)

  setSelectedAgent = (agent: string | null) => this.composerService.setSelectedAgent(agent)

  setPermissionMode = (mode: ClaudePermissionMode) => this.composerService.setPermissionMode(mode)

  resetPreferences = () => this.composerService.reset()

  prepareMessageEdit = (draft: MessageEditDraft) => this.messageEditService.prepare(draft)

  submitMessageEdit = (
    draft: MessageEditDraft,
    editTarget: ClaudeSessionEditAnchor,
    shouldRewindFiles: boolean,
  ) => this.messageEditService.submit(draft, editTarget, shouldRewindFiles)

  cancelMessageEdit = () => this.messageEditService.cancel()

  respondToolRequest = (toolUseId: string, result: ClaudeToolResult) =>
    this.sendService.respondToolRequest(toolUseId, result)

  dispose() {
    if (this.disposed) return Promise.resolve()
    this.disposed = true
    this.unsubscribeUsageSnapshot()
    this.followService.dispose()
    this.messageEditService.dispose()
    return this.sendService.dispose()
  }
}

export function createSessionController(options: SessionControllerOptions) {
  return new SessionController(options)
}
