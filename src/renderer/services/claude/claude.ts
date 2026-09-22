import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import type { ProviderApiType as RpcProviderApiType } from '@/shared/provider'
import type {
  ClaudeAgentInfo as RpcClaudeAgentInfo,
  ClaudeAttachmentPreview as RpcClaudeAttachmentPreview,
  ClaudeAttachmentPreviewParams as RpcClaudeAttachmentPreviewParams,
  ClaudeAttachmentReadParams as RpcClaudeAttachmentReadParams,
  ClaudeAttachmentReadResult as RpcClaudeAttachmentReadResult,
  ClaudeContextUsageSnapshot as RpcClaudeContextUsageSnapshot,
  ClaudeCreateProjectParams as RpcClaudeCreateProjectParams,
  ClaudeDropTrailingTurnParams as RpcClaudeDropTrailingTurnParams,
  ClaudeDropTrailingTurnResult as RpcClaudeDropTrailingTurnResult,
  ClaudeFollowState as RpcClaudeFollowState,
  ClaudeImageSource as RpcClaudeImageSource,
  ClaudeInitializationResult as RpcClaudeInitializationResult,
  ClaudeJsonLine as RpcClaudeJsonLine,
  ClaudeModelInfo as RpcClaudeModelInfo,
  ClaudeModelMappings as RpcClaudeModelMappings,
  ClaudeOptions as RpcClaudeOptions,
  ClaudePermissionMode as RpcClaudePermissionMode,
  ClaudePrepareAttachmentsParams as RpcClaudePrepareAttachmentsParams,
  ClaudePreparedAttachments as RpcClaudePreparedAttachments,
  ClaudeProject as RpcClaudeProject,
  ClaudeQueryParams as RpcClaudeQueryParams,
  ClaudeQueryStartParams as RpcClaudeQueryStartParams,
  ClaudeRewindFilesResult as RpcClaudeRewindFilesResult,
  ClaudeRewindSessionFilesParams as RpcClaudeRewindSessionFilesParams,
  ClaudeSampleContextUsageParams as RpcClaudeSampleContextUsageParams,
  ClaudeSelectFilesParams as RpcClaudeSelectFilesParams,
  ClaudeSelectProjectFolderParams as RpcClaudeSelectProjectFolderParams,
  ClaudeSession as RpcClaudeSession,
  ClaudeSessionEditAnchor as RpcClaudeSessionEditAnchor,
  ClaudeSessionEditAnchorParams as RpcClaudeSessionEditAnchorParams,
  ClaudeSlashCommand as RpcClaudeSlashCommand,
  ClaudeStartupParams as RpcClaudeStartupParams,
  ClaudeSubagent as RpcClaudeSubagent,
  ClaudeToolRequest as RpcClaudeToolRequest,
  ClaudeToolResult as RpcClaudeToolResult,
  ClaudeUpdateProjectParams as RpcClaudeUpdateProjectParams,
  ClaudeWorkflowAgent as RpcClaudeWorkflowAgent,
  ClaudeWorkflowPhase as RpcClaudeWorkflowPhase,
  ClaudeWorkflowRun as RpcClaudeWorkflowRun,
  ClaudeWorkflowStatus as RpcClaudeWorkflowStatus,
  FetchProviderModelsParams as RpcFetchProviderModelsParams,
  GetProviderUsageParams as RpcGetProviderUsageParams,
  ModelProvider as RpcModelProvider,
  ProjectFileSearchCapability as RpcProjectFileSearchCapability,
  ProjectFileSearchEntry as RpcProjectFileSearchEntry,
  ProjectFileSearchListParams as RpcProjectFileSearchListParams,
  ProjectFileSearchOutline as RpcProjectFileSearchOutline,
  ProjectFileSearchOutlineNode as RpcProjectFileSearchOutlineNode,
  ProjectFileSearchOutlineParams as RpcProjectFileSearchOutlineParams,
  ProjectFileSearchParams as RpcProjectFileSearchParams,
  ProjectFileSearchQueryParams as RpcProjectFileSearchQueryParams,
  ProjectFileSearchResult as RpcProjectFileSearchResult,
  ProjectIcon as RpcProjectIcon,
  ProviderModel as RpcProviderModel,
  ProviderModelSelection as RpcProviderModelSelection,
  ProviderUsageQuota as RpcProviderUsageQuota,
  ProviderUsageWindow as RpcProviderUsageWindow,
} from '@/shared/rpc'
import type { DraftSession, DraftSessionIndex, LocalSession } from '@/shared/session'

import { isDesktopRuntime, listenDesktopEvent, requestFromDesktop } from '../desktop/client'

export type ClaudeAgentInfo = RpcClaudeAgentInfo
export type ClaudeAttachmentReadParams = RpcClaudeAttachmentReadParams
export type ClaudeAttachmentReadResult = RpcClaudeAttachmentReadResult
export type ClaudeAttachmentPreview = RpcClaudeAttachmentPreview
export type ClaudeAttachmentPreviewParams = RpcClaudeAttachmentPreviewParams
export type ClaudePrepareAttachmentsParams = RpcClaudePrepareAttachmentsParams
export type ClaudePreparedAttachments = RpcClaudePreparedAttachments
export type ClaudeFollowState = RpcClaudeFollowState
export type ClaudeImageSource = RpcClaudeImageSource
export type ClaudeInitializationResult = RpcClaudeInitializationResult
export type ClaudeCreateProjectParams = RpcClaudeCreateProjectParams
export type ClaudeDropTrailingTurnParams = RpcClaudeDropTrailingTurnParams
export type ClaudeDropTrailingTurnResult = RpcClaudeDropTrailingTurnResult
export type ClaudeJsonLine = RpcClaudeJsonLine
export type ClaudeContextUsageSnapshot = RpcClaudeContextUsageSnapshot
export type ClaudeModelMappings = RpcClaudeModelMappings
export type ClaudeModelInfo = RpcClaudeModelInfo
export type ClaudeOptions = RpcClaudeOptions
export type ClaudePermissionMode = RpcClaudePermissionMode
export type ClaudeProjectIcon = RpcProjectIcon
export type ClaudeProject = RpcClaudeProject
export type ClaudeSelectProjectFolderParams = RpcClaudeSelectProjectFolderParams
export type ClaudeUpdateProjectParams = RpcClaudeUpdateProjectParams
export type ClaudeQueryParams = RpcClaudeQueryParams
export type ClaudeQueryStartParams = RpcClaudeQueryStartParams
export type ClaudeRewindFilesResult = RpcClaudeRewindFilesResult
export type ClaudeRewindSessionFilesParams = RpcClaudeRewindSessionFilesParams
export type ClaudeSampleContextUsageParams = RpcClaudeSampleContextUsageParams
export type ClaudeSelectFilesParams = RpcClaudeSelectFilesParams
export type ClaudeSessionEditAnchor = RpcClaudeSessionEditAnchor
export type ClaudeSessionEditAnchorParams = RpcClaudeSessionEditAnchorParams
export type FetchProviderModelsParams = RpcFetchProviderModelsParams
export type GetProviderUsageParams = RpcGetProviderUsageParams
export type ProviderUsageQuota = RpcProviderUsageQuota
export type ProviderUsageWindow = RpcProviderUsageWindow
export type ModelProvider = RpcModelProvider
export type ProviderApiType = RpcProviderApiType
export type ProviderModel = RpcProviderModel
export type ProviderModelSelection = RpcProviderModelSelection
export type ClaudeSession = RpcClaudeSession
export type ClaudeSlashCommand = RpcClaudeSlashCommand
export type ClaudeStartupParams = RpcClaudeStartupParams
export type ClaudeSubagent = RpcClaudeSubagent
export type ClaudeToolRequest = RpcClaudeToolRequest
export type ClaudeToolResult = RpcClaudeToolResult
export type ClaudeWorkflowAgent = RpcClaudeWorkflowAgent
export type ClaudeWorkflowPhase = RpcClaudeWorkflowPhase
export type ClaudeWorkflowRun = RpcClaudeWorkflowRun
export type ClaudeWorkflowStatus = RpcClaudeWorkflowStatus
export type ProjectFileSearchCapability = RpcProjectFileSearchCapability
export type ProjectFileSearchEntry = RpcProjectFileSearchEntry
export type ProjectFileSearchListParams = RpcProjectFileSearchListParams
export type ProjectFileSearchOutline = RpcProjectFileSearchOutline
export type ProjectFileSearchOutlineNode = RpcProjectFileSearchOutlineNode
export type ProjectFileSearchOutlineParams = RpcProjectFileSearchOutlineParams
export type ProjectFileSearchParams = RpcProjectFileSearchParams
export type ProjectFileSearchQueryParams = RpcProjectFileSearchQueryParams
export type ProjectFileSearchResult = RpcProjectFileSearchResult
export type ClaudeSdkMessage = SDKMessage
export type ClaudeSdkUserMessage = SDKUserMessage

function emptyInitializationResult(): ClaudeInitializationResult {
  return {
    cwd: '',
    commands: [],
    agents: [],
    models: [],
  }
}

type QueueItem<T> = { kind: 'value'; value: T } | { kind: 'error'; error: Error } | { kind: 'done' }

class AsyncQueue<T> {
  private items: QueueItem<T>[] = []
  private pending: {
    resolve: (result: IteratorResult<T, void>) => void
    reject: (error: Error) => void
  }[] = []
  private closed = false

  push(value: T) {
    if (this.closed) return
    this.deliver({ kind: 'value', value })
  }

  fail(error: Error) {
    if (this.closed) return
    this.closed = true
    this.deliver({ kind: 'error', error })
  }

  finish() {
    if (this.closed) return
    this.closed = true
    this.deliver({ kind: 'done' })
  }

  next(): Promise<IteratorResult<T, void>> {
    const item = this.items.shift()
    if (item) {
      return this.itemToResult(item)
    }

    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined })
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject })
    })
  }

  private deliver(item: QueueItem<T>) {
    const pending = this.pending.shift()
    if (!pending) {
      this.items.push(item)
      return
    }

    void this.itemToResult(item).then(pending.resolve, pending.reject)
  }

  private itemToResult(item: QueueItem<T>): Promise<IteratorResult<T, void>> {
    if (item.kind === 'value') {
      return Promise.resolve({ done: false, value: item.value })
    }
    if (item.kind === 'error') {
      return Promise.reject(item.error)
    }
    return Promise.resolve({ done: true, value: undefined })
  }
}

export interface ClaudeQuery extends AsyncGenerator<SDKMessage, void> {
  /** Client-generated UUID attached to the initial user message. */
  userMessageUuid?: string
  /** Session ID reserved for a fresh query before the SDK emits system/init. */
  sessionId?: string
  subscribeToolRequests(handler: (request: ClaudeToolRequest) => void): () => void
  respondToolRequest(toolUseId: string, result: ClaudeToolResult): Promise<void>
  interrupt(): Promise<void>
  rewindFiles(userMessageId: string, options?: { dryRun?: boolean }): Promise<unknown>
  setPermissionMode(mode: ClaudePermissionMode): Promise<void>
  setModel(model?: string): Promise<void>
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>
  applyFlagSettings(settings: Record<string, unknown>): Promise<void>
  initializationResult(): Promise<ClaudeInitializationResult>
  reinitialize(): Promise<ClaudeInitializationResult>
  supportedCommands(): Promise<ClaudeSlashCommand[]>
  supportedModels(): Promise<ClaudeModelInfo[]>
  getContextUsage(): Promise<ClaudeContextUsageSnapshot | null>
  supportedAgents(): Promise<ClaudeAgentInfo[]>
  mcpServerStatus(): Promise<unknown[]>
  accountInfo(): Promise<ClaudeInitializationResult['account']>
  reconnectMcpServer(serverName: string): Promise<void>
  toggleMcpServer(serverName: string, enabled: boolean): Promise<void>
  setMcpServers(servers: Record<string, unknown>): Promise<unknown>
  streamInput(stream: AsyncIterable<SDKUserMessage>): Promise<void>
  stopTask(taskId: string): Promise<void>
  close(): void | Promise<void>
}

function createStreamId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `claude-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createUserMessageUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function desktopUnavailableQuery(): ClaudeQuery {
  const queue = new AsyncQueue<SDKMessage>()
  queue.fail(new Error('Claude execution is available inside the desktop app.'))
  return createClaudeQueryFromQueue({
    streamId: 'unavailable',
    queue,
    cleanup: () => {},
    respondToolRequest: async () => {},
    subscribeToolRequests: () => () => {},
    userMessageUuid: createUserMessageUuid(),
  })
}

function controlRequest<T>(streamId: string, command: string, params: unknown[] = []) {
  return requestFromDesktop('claudeQueryControl', {
    streamId,
    command: command as never,
    params,
  }) as Promise<T>
}

function createClaudeQueryFromQueue({
  cleanup,
  queue,
  respondToolRequest,
  streamId,
  subscribeToolRequests,
  userMessageUuid,
}: {
  cleanup: () => void
  queue: AsyncQueue<SDKMessage>
  respondToolRequest: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
  streamId: string
  subscribeToolRequests: (handler: (request: ClaudeToolRequest) => void) => () => void
  userMessageUuid?: string
}): ClaudeQuery {
  let closed = false
  let closeResult: Promise<void> | undefined
  const close = () => {
    if (closed) return closeResult
    closed = true
    cleanup()
    queue.finish()
    if (streamId !== 'unavailable') {
      closeResult = requestFromDesktop('claudeQueryClose', { streamId })
      void closeResult.catch(() => {})
    }
    return closeResult
  }

  const query: ClaudeQuery = {
    userMessageUuid,
    [Symbol.asyncIterator]() {
      return query
    },
    async [Symbol.asyncDispose]() {
      close()
    },
    next() {
      return queue.next()
    },
    async throw(error?: unknown) {
      close()
      throw error instanceof Error ? error : new Error(String(error ?? 'Claude query interrupted'))
    },
    async return() {
      close()
      return { done: true as const, value: undefined }
    },
    subscribeToolRequests,
    respondToolRequest,
    interrupt: () => controlRequest<void>(streamId, 'interrupt'),
    rewindFiles: (userMessageId: string, options?: { dryRun?: boolean }) =>
      controlRequest<unknown>(streamId, 'rewindFiles', [userMessageId, options]),
    setPermissionMode: (mode: ClaudePermissionMode) =>
      controlRequest<void>(streamId, 'setPermissionMode', [mode]),
    setModel: (model?: string) => controlRequest<void>(streamId, 'setModel', [model]),
    setMaxThinkingTokens: (maxThinkingTokens: number | null) =>
      controlRequest<void>(streamId, 'setMaxThinkingTokens', [maxThinkingTokens]),
    applyFlagSettings: (settings: Record<string, unknown>) =>
      controlRequest<void>(streamId, 'applyFlagSettings', [settings]),
    initializationResult: () =>
      controlRequest<ClaudeInitializationResult>(streamId, 'initializationResult'),
    reinitialize: () => controlRequest<ClaudeInitializationResult>(streamId, 'reinitialize'),
    supportedCommands: () => controlRequest<ClaudeSlashCommand[]>(streamId, 'supportedCommands'),
    supportedModels: () => controlRequest<ClaudeModelInfo[]>(streamId, 'supportedModels'),
    getContextUsage: () =>
      controlRequest<ClaudeContextUsageSnapshot | null>(streamId, 'getContextUsage'),
    supportedAgents: () => controlRequest<ClaudeAgentInfo[]>(streamId, 'supportedAgents'),
    mcpServerStatus: () => controlRequest<unknown[]>(streamId, 'mcpServerStatus'),
    accountInfo: () =>
      controlRequest<ClaudeInitializationResult['account']>(streamId, 'accountInfo'),
    reconnectMcpServer: (serverName: string) =>
      controlRequest<void>(streamId, 'reconnectMcpServer', [serverName]),
    toggleMcpServer: (serverName: string, enabled: boolean) =>
      controlRequest<void>(streamId, 'toggleMcpServer', [serverName, enabled]),
    setMcpServers: (servers: Record<string, unknown>) =>
      controlRequest<unknown>(streamId, 'setMcpServers', [servers]),
    async streamInput(stream: AsyncIterable<SDKUserMessage>) {
      const inputStreamId = createStreamId()
      await requestFromDesktop('claudeQueryStreamInputStart', { streamId, inputStreamId })
      try {
        for await (const message of stream) {
          await requestFromDesktop('claudeQueryStreamInputMessage', {
            streamId,
            inputStreamId,
            message,
          })
        }
        await requestFromDesktop('claudeQueryStreamInputComplete', { streamId, inputStreamId })
      } catch (caught) {
        await requestFromDesktop('claudeQueryStreamInputError', {
          streamId,
          inputStreamId,
          message: caught instanceof Error ? caught.message : 'Failed to stream Claude input',
        })
      }
    },
    stopTask: (taskId: string) => controlRequest<void>(streamId, 'stopTask', [taskId]),
    close,
  } satisfies ClaudeQuery

  return query
}

function createDesktopQuery(params: ClaudeQueryParams): ClaudeQuery {
  const streamId = createStreamId()
  const userMessageUuid = params.userMessageUuid ?? createUserMessageUuid()
  const sessionId = params.options?.resume
    ? undefined
    : (params.options?.sessionId ?? createUserMessageUuid())
  const queue = new AsyncQueue<SDKMessage>()
  const toolRequestHandlers = new Set<(request: ClaudeToolRequest) => void>()
  const unlisteners: Promise<() => void>[] = []
  const cleanup = () => {
    toolRequestHandlers.clear()
    for (const unlisten of unlisteners) {
      void unlisten.then((fn) => fn())
    }
  }

  unlisteners.push(
    listenDesktopEvent('claude-output', (payload) => {
      if (payload.streamId === streamId) {
        queue.push(payload.message)
      }
    }),
    listenDesktopEvent('claude-error', (payload) => {
      if (payload.streamId === streamId) {
        const error = new Error(payload.message)
        if (payload.stack) error.stack = payload.stack
        queue.fail(error)
        cleanup()
      }
    }),
    listenDesktopEvent('claude-complete', (payload) => {
      if (payload.streamId !== streamId) return
      if (payload.success) {
        queue.finish()
      } else {
        queue.fail(
          new Error('Claude finished with an error. Check the last output line for details.'),
        )
      }
      cleanup()
    }),
    listenDesktopEvent('claude-tool-request', (payload) => {
      if (payload.streamId !== streamId) return
      for (const handler of toolRequestHandlers) {
        handler(payload.request)
      }
    }),
  )

  void requestFromDesktop('claudeQueryStart', {
    ...params,
    options: { ...params.options, ...(sessionId ? { sessionId } : {}) },
    userMessageUuid,
    streamId,
  }).catch((caught) => {
    queue.fail(caught instanceof Error ? caught : new Error('Failed to start Claude query'))
    cleanup()
  })

  return Object.assign(
    createClaudeQueryFromQueue({
      streamId,
      queue,
      cleanup,
      respondToolRequest: (toolUseId, result) =>
        requestFromDesktop('claudeRespondToolRequest', { streamId, toolUseId, result }),
      subscribeToolRequests: (handler) => {
        toolRequestHandlers.add(handler)
        return () => toolRequestHandlers.delete(handler)
      },
      userMessageUuid,
    }),
    sessionId ? { sessionId } : {},
  )
}

function isTauriRuntime() {
  return isDesktopRuntime()
}

export const claude = {
  async startup(params: ClaudeStartupParams = {}) {
    if (!isTauriRuntime()) {
      return emptyInitializationResult()
    }

    return requestFromDesktop('claudeStartup', params)
  },
  query(params: ClaudeQueryParams) {
    if (!isTauriRuntime()) {
      return desktopUnavailableQuery()
    }

    return createDesktopQuery(params)
  },
  followSession(
    projectId: string,
    sessionId: string,
    handlers: {
      onUpdate: (lines: ClaudeJsonLine[]) => void
      onState: (state: ClaudeFollowState) => void
      onReset: () => void
    },
  ): { stop: () => void } {
    if (!isTauriRuntime()) {
      return { stop: () => {} }
    }
    // Set stop synchronously to block callbacks already in flight before unlisten completes.
    let stopped = false
    const unlisteners: Promise<() => void>[] = [
      listenDesktopEvent('claude-follow-update', (payload) => {
        if (stopped || payload.sessionId !== sessionId) return
        handlers.onUpdate(payload.lines)
      }),
      listenDesktopEvent('claude-follow-state', (payload) => {
        if (stopped || payload.sessionId !== sessionId) return
        handlers.onState(payload.state)
      }),
      listenDesktopEvent('claude-follow-reset', (payload) => {
        if (stopped || payload.sessionId !== sessionId) return
        handlers.onReset()
      }),
    ]
    void Promise.resolve(requestFromDesktop('claudeFollowStart', { projectId, sessionId })).catch(
      () => {},
    )
    return {
      stop: () => {
        stopped = true
        for (const unlisten of unlisteners) void unlisten.then((fn) => fn())
        void Promise.resolve(requestFromDesktop('claudeFollowStop', { sessionId })).catch(() => {})
      },
    }
  },
  async listProviders() {
    if (!isTauriRuntime()) {
      return []
    }

    const providers = await requestFromDesktop('claudeListProviders', {})
    return Array.isArray(providers) ? providers : []
  },
  async listModelMappings() {
    if (!isTauriRuntime()) {
      return {}
    }

    const mappings = await requestFromDesktop('claudeListModelMappings', {})
    return mappings && typeof mappings === 'object' ? mappings : {}
  },
  async fetchProviderModels(params: FetchProviderModelsParams) {
    if (!isTauriRuntime()) {
      return []
    }

    return requestFromDesktop('claudeFetchProviderModels', params)
  },
  async getProviderUsage(params: GetProviderUsageParams): Promise<ProviderUsageQuota | null> {
    if (!isTauriRuntime()) {
      return null
    }

    return requestFromDesktop('claudeGetProviderUsage', params)
  },
  async createProvider(provider: ModelProvider) {
    if (!isTauriRuntime()) {
      return provider
    }

    return requestFromDesktop('claudeCreateProvider', { provider })
  },
  async updateProvider(provider: ModelProvider) {
    if (!isTauriRuntime()) {
      return provider
    }

    return requestFromDesktop('claudeUpdateProvider', { provider })
  },
  async deleteProvider(id: string) {
    if (!isTauriRuntime()) {
      return
    }

    return requestFromDesktop('claudeDeleteProvider', { id })
  },
  async saveModelMappings(models: ClaudeModelMappings) {
    if (!isTauriRuntime()) {
      return models
    }

    return requestFromDesktop('claudeSaveModelMappings', { models })
  },
  async setProjectModel(params: ProviderModelSelection & { projectId: string }) {
    if (!isTauriRuntime()) {
      return
    }

    return requestFromDesktop('claudeSetProjectModel', params)
  },
  async listProjects() {
    if (!isTauriRuntime()) {
      return []
    }

    const projects = await requestFromDesktop('claudeListProjects', {})
    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      return [mock.MOCK_PROJECT, ...projects]
    }
    return projects
  },
  async addProjectFromFolder() {
    if (!isTauriRuntime()) {
      return null
    }

    return requestFromDesktop('claudeAddProjectFromFolder', {})
  },
  async selectProjectFolder(params: ClaudeSelectProjectFolderParams = {}) {
    if (!isTauriRuntime()) return null
    return requestFromDesktop('claudeSelectProjectFolder', params)
  },
  async createProject(params: ClaudeCreateProjectParams) {
    if (!isTauriRuntime()) {
      throw new Error('Project management is only available in the desktop app')
    }
    return requestFromDesktop('claudeCreateProject', params)
  },
  async updateProject(params: ClaudeUpdateProjectParams) {
    if (!isTauriRuntime()) {
      throw new Error('Project management is only available in the desktop app')
    }
    return requestFromDesktop('claudeUpdateProject', params)
  },
  async removeProject(projectId: string) {
    if (!isTauriRuntime()) return
    return requestFromDesktop('claudeRemoveProject', { projectId })
  },
  async selectFiles(params: ClaudeSelectFilesParams = {}) {
    if (!isTauriRuntime()) {
      return []
    }

    return requestFromDesktop('claudeSelectFiles', params)
  },
  async getAttachmentPreview(
    params: ClaudeAttachmentPreviewParams,
  ): Promise<ClaudeAttachmentPreview> {
    if (!isTauriRuntime()) return { dataUrl: null }
    return requestFromDesktop('claudeGetAttachmentPreview', params)
  },
  async prepareAttachments(
    params: ClaudePrepareAttachmentsParams,
  ): Promise<ClaudePreparedAttachments> {
    if (!isTauriRuntime()) {
      throw new Error('Attachment preparation is only available in the desktop app')
    }
    return requestFromDesktop('claudePrepareAttachments', params)
  },
  async loadAttachments(params: ClaudeAttachmentReadParams): Promise<ClaudeAttachmentReadResult> {
    if (!isTauriRuntime()) return { attachments: [], rejected: [] }
    return requestFromDesktop('attachmentRead', params)
  },
  async canSearchProjectFiles(params: ProjectFileSearchParams) {
    if (!isTauriRuntime()) {
      return {
        isGit: false,
        message: '@ file search is not supported in the current directory',
        reason: 'missing-project' as const,
        strategy: 'none' as const,
        supported: false,
      }
    }

    return requestFromDesktop('claudeCanSearchProjectFiles', params)
  },
  async listProjectRootEntries(params: ProjectFileSearchListParams) {
    if (!isTauriRuntime()) {
      return {
        items: [],
        message: '@ file search is not supported in the current directory',
        query: '',
        reason: 'missing-project' as const,
        supported: false,
      }
    }

    return requestFromDesktop('claudeListProjectRootEntries', params)
  },
  async enterProjectFileSearchWarmup(params: ProjectFileSearchParams) {
    if (!isTauriRuntime()) {
      return {
        isGit: false,
        message: '@ file search is not supported in the current directory',
        reason: 'missing-project' as const,
        strategy: 'none' as const,
        supported: false,
      }
    }

    return requestFromDesktop('claudeEnterProjectFileSearchWarmup', params)
  },
  async exitProjectFileSearchWarmup(params: ProjectFileSearchParams) {
    if (!isTauriRuntime()) {
      return
    }

    return requestFromDesktop('claudeExitProjectFileSearchWarmup', params)
  },
  async searchProjectFiles(params: ProjectFileSearchQueryParams) {
    if (!isTauriRuntime()) {
      return {
        items: [],
        message: '@ file search is not supported in the current directory',
        query: params.query,
        reason: 'missing-project' as const,
        supported: false,
      }
    }

    return requestFromDesktop('claudeSearchProjectFiles', params)
  },
  async getProjectFileOutline(params: ProjectFileSearchOutlineParams) {
    if (!isTauriRuntime()) {
      return {
        message: '@ file search is not supported in the current directory',
        nodes: [],
        reason: 'missing-project' as const,
        supported: false,
      }
    }

    return requestFromDesktop('claudeGetProjectFileOutline', params)
  },
  async setProjectLastOpened(projectId: string) {
    if (!isTauriRuntime()) {
      return
    }

    return requestFromDesktop('claudeSetProjectLastOpened', { projectId })
  },
  async listSessions(projectId: string) {
    if (!isTauriRuntime()) {
      return []
    }

    return requestFromDesktop('claudeListSessions', { projectId })
  },
  async listDraftSessions(): Promise<DraftSessionIndex> {
    if (!isTauriRuntime()) return {}
    return requestFromDesktop('sessionListDrafts', {})
  },
  async readLocalSession(sessionId: string): Promise<LocalSession | null> {
    if (!isTauriRuntime()) return null
    return requestFromDesktop('sessionRead', { sessionId })
  },
  async writeLocalSession(
    sessionId: string,
    data: LocalSession,
    draft?: DraftSession,
  ): Promise<void> {
    if (!isTauriRuntime()) return
    return requestFromDesktop('sessionWrite', { sessionId, data, ...(draft ? { draft } : {}) })
  },
  async updateLocalDraft(sessionId: string, draft: DraftSession): Promise<void> {
    if (!isDesktopRuntime()) return
    await requestFromDesktop('sessionUpdateDraft', { sessionId, draft })
  },
  async completeLocalDraft(sessionId: string): Promise<void> {
    if (!isTauriRuntime()) return
    return requestFromDesktop('sessionCompleteDraft', { sessionId })
  },
  async bindSessionOwner(params: {
    sessionId: string
    projectId: string | null
    claudeSessionId: string
  }): Promise<void> {
    if (!isTauriRuntime()) return
    return requestFromDesktop('sessionBindOwner', params)
  },
  async deleteLocalSession(sessionId: string): Promise<void> {
    if (!isTauriRuntime()) return
    return requestFromDesktop('sessionDelete', { sessionId })
  },
  async deleteLocalProjectSessions(projectId: string): Promise<void> {
    if (!isTauriRuntime()) return
    return requestFromDesktop('sessionDeleteProject', { projectId })
  },
  async getProjectSessions(projectId: string) {
    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      if (projectId === mock.MOCK_PROJECT_ID) {
        return mock.MOCK_SESSIONS.map((session, index) => ({
          ...session.meta,
          project_id: mock.MOCK_PROJECT_ID,
          project_path: mock.MOCK_PROJECT.path,
          created_at: session.meta.created_at ?? Date.now() - index * 1000,
        }))
      }
    }
    return this.listSessions(projectId)
  },
  async getSessionMessages(sessionId: string, projectId: string) {
    if (!isTauriRuntime()) {
      return []
    }

    return requestFromDesktop('claudeGetSessionMessages', { sessionId, projectId })
  },
  async getWorkflowRuns(sessionId: string, projectId: string, runIds: string[]) {
    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      if (projectId === mock.MOCK_PROJECT_ID) {
        return mock.findMockWorkflowRuns(sessionId, runIds)
      }
    }
    if (!isTauriRuntime()) {
      return []
    }

    return requestFromDesktop('claudeGetWorkflowRuns', { sessionId, projectId, runIds })
  },
  async loadSessionHistory(sessionId: string, projectId: string) {
    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      if (projectId === mock.MOCK_PROJECT_ID) {
        return mock.findMockSession(sessionId)?.lines() ?? []
      }
    }
    return this.getSessionMessages(sessionId, projectId)
  },
  async listSubagents(sessionId: string, projectId: string) {
    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      if (projectId === mock.MOCK_PROJECT_ID) {
        return mock.listMockSubagents(sessionId)
      }
    }
    if (!isTauriRuntime()) {
      return []
    }

    return requestFromDesktop('claudeListSubagents', { sessionId, projectId })
  },
  async getSubagentMessages(sessionId: string, projectId: string, agentId: string) {
    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      if (projectId === mock.MOCK_PROJECT_ID) {
        return mock.getMockSubagentMessages(sessionId, agentId)
      }
    }
    if (!isTauriRuntime()) {
      return []
    }

    return requestFromDesktop('claudeGetSubagentMessages', { sessionId, projectId, agentId })
  },
  async forkSession({
    sessionId,
    projectId,
    messageId,
  }: {
    sessionId: string
    projectId: string
    messageId: string
  }) {
    if (!isTauriRuntime()) {
      throw new Error('Session branching requires the desktop runtime')
    }

    return requestFromDesktop('claudeForkSession', { sessionId, projectId, messageId })
  },
  async getSessionEditAnchor(params: ClaudeSessionEditAnchorParams) {
    if (!isTauriRuntime()) {
      throw new Error('Editing historical messages requires the desktop runtime')
    }

    return requestFromDesktop('claudeGetSessionEditAnchor', params)
  },
  async rewindSessionFiles(params: ClaudeRewindSessionFilesParams) {
    if (!isTauriRuntime()) {
      throw new Error('Rewinding session files requires the desktop runtime')
    }

    return requestFromDesktop('claudeRewindSessionFiles', params)
  },
  async dropTrailingTurn(
    params: ClaudeDropTrailingTurnParams,
  ): Promise<ClaudeDropTrailingTurnResult> {
    if (!isTauriRuntime()) {
      return { dropped: false, removedSession: false }
    }

    return requestFromDesktop('claudeDropTrailingTurn', params)
  },
  async sampleContextUsage(params: ClaudeSampleContextUsageParams) {
    if (!isTauriRuntime()) {
      return null
    }

    return requestFromDesktop('claudeSampleContextUsage', params)
  },
  async getProjectGitBranch(projectPath: string) {
    if (!isTauriRuntime()) {
      return null
    }

    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      if (projectPath === mock.MOCK_PROJECT.path) {
        return null
      }
    }
    return requestFromDesktop('claudeGetProjectGitBranch', { projectPath })
  },
  async renameSession({
    projectId,
    sessionId,
    title,
  }: {
    projectId: string
    sessionId: string
    title: string
  }) {
    if (!isTauriRuntime()) {
      return
    }

    return requestFromDesktop('claudeRenameSession', { projectId, sessionId, title })
  },
  async deleteSession({ projectId, sessionId }: { projectId: string; sessionId: string }) {
    if (!isTauriRuntime()) {
      return
    }

    return requestFromDesktop('claudeDeleteSession', { projectId, sessionId })
  },
}
