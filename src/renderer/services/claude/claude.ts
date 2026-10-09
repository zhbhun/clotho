import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import type { ProviderApiType as RpcProviderApiType } from '@/shared/provider'
import type {
  ClaudeAgentInfo as RpcClaudeAgentInfo,
  ClaudeAttachment as RpcClaudeAttachment,
  ClaudeAttachmentPreview as RpcClaudeAttachmentPreview,
  ClaudeAttachmentPreviewParams as RpcClaudeAttachmentPreviewParams,
  ClaudeAttachmentReadParams as RpcClaudeAttachmentReadParams,
  ClaudeAttachmentReadResult as RpcClaudeAttachmentReadResult,
  ClaudeContextUsageSnapshot as RpcClaudeContextUsageSnapshot,
  ClaudeCreateProjectParams as RpcClaudeCreateProjectParams,
  ClaudeDropTrailingTurnParams as RpcClaudeDropTrailingTurnParams,
  ClaudeDropTrailingTurnResult as RpcClaudeDropTrailingTurnResult,
  ClaudeImageSource as RpcClaudeImageSource,
  ClaudeInitializationResult as RpcClaudeInitializationResult,
  ClaudeJsonLine as RpcClaudeJsonLine,
  ClaudeModelInfo as RpcClaudeModelInfo,
  ClaudeOptions as RpcClaudeOptions,
  ClaudePermissionMode as RpcClaudePermissionMode,
  ClaudePrepareAttachmentsParams as RpcClaudePrepareAttachmentsParams,
  ClaudePreparedAttachments as RpcClaudePreparedAttachments,
  ClaudeProject as RpcClaudeProject,
  ClaudeRewindFilesResult as RpcClaudeRewindFilesResult,
  ClaudeRewindSessionFilesParams as RpcClaudeRewindSessionFilesParams,
  ClaudeSampleContextUsageParams as RpcClaudeSampleContextUsageParams,
  ClaudeSaveImageParams as RpcClaudeSaveImageParams,
  ClaudeSaveImageResult as RpcClaudeSaveImageResult,
  ClaudeSelectFilesParams as RpcClaudeSelectFilesParams,
  ClaudeSelectProjectFolderParams as RpcClaudeSelectProjectFolderParams,
  ClaudeSession as RpcClaudeSession,
  ClaudeSessionEditAnchor as RpcClaudeSessionEditAnchor,
  ClaudeSessionEditAnchorParams as RpcClaudeSessionEditAnchorParams,
  ClaudeSessionQueryEnsureParams as RpcClaudeSessionQueryEnsureParams,
  ClaudeSessionQueryEnsureResult as RpcClaudeSessionQueryEnsureResult,
  ClaudeSessionQueryRebuildParams as RpcClaudeSessionQueryRebuildParams,
  ClaudeSessionStreamState as RpcClaudeSessionStreamState,
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
  GitBranchRef as RpcGitBranchRef,
  GitBranchSwitchResult as RpcGitBranchSwitchResult,
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
export type ClaudeAttachment = RpcClaudeAttachment
export type ClaudeAttachmentPreview = RpcClaudeAttachmentPreview
export type ClaudeAttachmentPreviewParams = RpcClaudeAttachmentPreviewParams
export type ClaudeSaveImageParams = RpcClaudeSaveImageParams
export type ClaudeSaveImageResult = RpcClaudeSaveImageResult
export type ClaudePrepareAttachmentsParams = RpcClaudePrepareAttachmentsParams
export type ClaudePreparedAttachments = RpcClaudePreparedAttachments
export type ClaudeImageSource = RpcClaudeImageSource
export type ClaudeInitializationResult = RpcClaudeInitializationResult
export type ClaudeCreateProjectParams = RpcClaudeCreateProjectParams
export type ClaudeDropTrailingTurnParams = RpcClaudeDropTrailingTurnParams
export type ClaudeDropTrailingTurnResult = RpcClaudeDropTrailingTurnResult
export type ClaudeJsonLine = RpcClaudeJsonLine
export type ClaudeContextUsageSnapshot = RpcClaudeContextUsageSnapshot
export type ClaudeModelInfo = RpcClaudeModelInfo
export type ClaudeOptions = RpcClaudeOptions
export type ClaudePermissionMode = RpcClaudePermissionMode
export type ClaudeProjectIcon = RpcProjectIcon
export type ClaudeProject = RpcClaudeProject
export type ClaudeSelectProjectFolderParams = RpcClaudeSelectProjectFolderParams
export type ClaudeUpdateProjectParams = RpcClaudeUpdateProjectParams
export type ClaudeRewindFilesResult = RpcClaudeRewindFilesResult
export type ClaudeRewindSessionFilesParams = RpcClaudeRewindSessionFilesParams
export type ClaudeSampleContextUsageParams = RpcClaudeSampleContextUsageParams
export type ClaudeSelectFilesParams = RpcClaudeSelectFilesParams
export type ClaudeSessionEditAnchor = RpcClaudeSessionEditAnchor
export type ClaudeSessionEditAnchorParams = RpcClaudeSessionEditAnchorParams
export type FetchProviderModelsParams = RpcFetchProviderModelsParams
export type GetProviderUsageParams = RpcGetProviderUsageParams
export type GitBranchRef = RpcGitBranchRef
export type GitBranchSwitchResult = RpcGitBranchSwitchResult
export type ProviderUsageQuota = RpcProviderUsageQuota
export type ProviderUsageWindow = RpcProviderUsageWindow
export type ModelProvider = RpcModelProvider
export type ProviderApiType = RpcProviderApiType
export type ProviderModel = RpcProviderModel
export type ProviderModelSelection = RpcProviderModelSelection
export type ClaudeSession = RpcClaudeSession
export type ClaudeSessionQueryEnsureParams = RpcClaudeSessionQueryEnsureParams
export type ClaudeSessionQueryRebuildParams = RpcClaudeSessionQueryRebuildParams
export type ClaudeSessionStreamState = RpcClaudeSessionStreamState
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

function controlRequest<T>(streamId: string, command: string, params: unknown[] = []) {
  return requestFromDesktop('claudeQueryControl', {
    streamId,
    command: command as never,
    params,
  }) as Promise<T>
}

function isTauriRuntime() {
  return isDesktopRuntime()
}

export interface ClaudeSessionStreamPushParams {
  text: string
  attachments?: ClaudeAttachment[]
  userMessageUuid?: string
  syntheticOrigin?: 'auto-continuation'
}

/**
 * A long-lived, session-keyed Claude query owned by the main process. Unlike a
 * per-send ClaudeQuery, the generator only ends when the query dies or the
 * consumer detaches — result frames end turns, not the stream.
 */
export interface ClaudeSessionStream extends AsyncGenerator<SDKMessage, void> {
  [Symbol.asyncDispose](): Promise<void>
  readonly sessionId: string
  readonly streamId: string
  getState(): ClaudeSessionStreamState
  push(params: ClaudeSessionStreamPushParams): Promise<void>
  subscribeToolRequests(handler: (request: ClaudeToolRequest) => void): () => void
  respondToolRequest(toolUseId: string, result: ClaudeToolResult): Promise<void>
  interrupt(): Promise<void>
  setPermissionMode(mode: ClaudePermissionMode): Promise<void>
  setModel(model?: string): Promise<void>
  setMaxThinkingTokens(maxThinkingTokens: number | null): Promise<void>
  applyFlagSettings(settings: Record<string, unknown>): Promise<void>
  getContextUsage(): Promise<ClaudeContextUsageSnapshot | null>
  stopTask(taskId: string): Promise<void>
  /** Stop consuming and unsubscribe; the query keeps running in the main process. */
  detach(): void
}

function createSessionStream(
  sessionId: string,
  attach: Promise<RpcClaudeSessionQueryEnsureResult>,
): ClaudeSessionStream {
  const queue = new AsyncQueue<SDKMessage>()
  const toolRequestHandlers = new Set<(request: ClaudeToolRequest) => void>()
  const unlisteners: Promise<() => void>[] = []
  const unlisten = (stop: Promise<() => void>) => unlisteners.push(stop)
  // Events can arrive before the ensure reply resolves the stream id; they are
  // buffered and filtered once attached, so no live frame is dropped.
  const buffered: Array<() => void> = []
  let state: ClaudeSessionStreamState = {
    claudeSessionId: null,
    status: 'starting',
    turnInFlight: false,
    pendingToolRequests: [],
    backgroundTaskIds: [],
  }
  let streamId = ''
  let detached = false

  const applyFrameState = (message: SDKMessage) => {
    if (message.type === 'result') {
      state = { ...state, turnInFlight: false }
    } else if (
      message.type === 'user' ||
      message.type === 'assistant' ||
      message.type === 'stream_event'
    ) {
      state = { ...state, turnInFlight: true }
    }
    if (message.type === 'system' && message.subtype === 'init') {
      const claudeSessionId = (message as { session_id?: string }).session_id
      state = {
        ...state,
        claudeSessionId: claudeSessionId ?? state.claudeSessionId,
        status: 'ready',
      }
    }
  }

  const deliver = (run: () => void) => {
    if (!streamId) {
      buffered.push(run)
      return
    }
    run()
  }

  const die = (error?: Error) => {
    state = { ...state, status: 'dead' }
    if (error) queue.fail(error)
    else queue.finish()
  }

  unlisten(
    listenDesktopEvent('claude-output', (payload) => {
      deliver(() => {
        if (payload.streamId !== streamId) return
        applyFrameState(payload.message)
        queue.push(payload.message)
      })
    }),
  )
  unlisten(
    listenDesktopEvent('claude-error', (payload) => {
      deliver(() => {
        if (payload.streamId !== streamId) return
        const error = new Error(payload.message)
        if (payload.stack) error.stack = payload.stack
        die(error)
      })
    }),
  )
  unlisten(
    listenDesktopEvent('claude-complete', (payload) => {
      deliver(() => {
        if (payload.streamId !== streamId) return
        die(
          payload.success
            ? undefined
            : new Error('Claude finished with an error. Check the last output line for details.'),
        )
      })
    }),
  )
  unlisten(
    listenDesktopEvent('claude-tool-request', (payload) => {
      deliver(() => {
        if (payload.streamId !== streamId) return
        state = {
          ...state,
          pendingToolRequests: [...state.pendingToolRequests, payload.request],
        }
        for (const handler of [...toolRequestHandlers]) handler(payload.request)
      })
    }),
  )

  const attached = attach.then(
    (result) => {
      if (detached) return result
      streamId = result.streamId
      state = { ...state, ...result.state }
      // Mid-turn attach renders the partial turn first; live frames follow.
      for (const frame of result.replay) {
        applyFrameState(frame)
        queue.push(frame)
      }
      for (const flush of buffered.splice(0)) flush()
      // Requests already pending at attach time still owe an answer.
      for (const request of result.state.pendingToolRequests) {
        for (const handler of [...toolRequestHandlers]) handler(request)
      }
      return result
    },
    (caught: unknown) => {
      die(caught instanceof Error ? caught : new Error('Failed to attach the session query'))
      throw caught
    },
  )

  const stream: ClaudeSessionStream = {
    sessionId,
    get streamId() {
      return streamId
    },
    [Symbol.asyncIterator]() {
      return stream
    },
    async [Symbol.asyncDispose]() {
      detach()
    },
    next() {
      return queue.next()
    },
    async throw(error?: unknown) {
      detach()
      throw error instanceof Error
        ? error
        : new Error(String(error ?? 'Session stream interrupted'))
    },
    async return() {
      detach()
      return { done: true as const, value: undefined }
    },
    getState: () => state,
    async push({ attachments, syntheticOrigin, text, userMessageUuid }) {
      const { streamId: id } = await attached
      await requestFromDesktop('claudeSessionQueryPush', {
        streamId: id,
        text,
        ...(attachments?.length ? { attachments } : {}),
        ...(userMessageUuid ? { userMessageUuid } : {}),
        ...(syntheticOrigin ? { syntheticOrigin } : {}),
      })
    },
    subscribeToolRequests(handler) {
      toolRequestHandlers.add(handler)
      return () => toolRequestHandlers.delete(handler)
    },
    async respondToolRequest(toolUseId, result) {
      const { streamId: id } = await attached
      state = {
        ...state,
        pendingToolRequests: state.pendingToolRequests.filter(
          (request) => request.toolUseId !== toolUseId,
        ),
      }
      await requestFromDesktop('claudeRespondToolRequest', { streamId: id, toolUseId, result })
    },
    async interrupt() {
      const { streamId: id } = await attached
      await controlRequest<void>(id, 'interrupt')
    },
    async setPermissionMode(mode) {
      const { streamId: id } = await attached
      await controlRequest<void>(id, 'setPermissionMode', [mode])
    },
    async setModel(model) {
      const { streamId: id } = await attached
      await controlRequest<void>(id, 'setModel', [model])
    },
    async setMaxThinkingTokens(maxThinkingTokens) {
      const { streamId: id } = await attached
      await controlRequest<void>(id, 'setMaxThinkingTokens', [maxThinkingTokens])
    },
    async applyFlagSettings(settings) {
      const { streamId: id } = await attached
      await controlRequest<void>(id, 'applyFlagSettings', [settings])
    },
    async getContextUsage() {
      const { streamId: id } = await attached
      return controlRequest<ClaudeContextUsageSnapshot | null>(id, 'getContextUsage')
    },
    async stopTask(taskId) {
      const { streamId: id } = await attached
      await controlRequest<void>(id, 'stopTask', [taskId])
    },
    detach() {
      detach()
    },
  }

  function detach() {
    if (detached) return
    detached = true
    for (const stop of unlisteners) void stop.then((fn) => fn())
    toolRequestHandlers.clear()
    queue.finish()
  }

  return stream
}

export const claude = {
  async startup(params: ClaudeStartupParams = {}) {
    if (!isTauriRuntime()) {
      return emptyInitializationResult()
    }

    return requestFromDesktop('claudeStartup', params)
  },
  /** Attach to the session's resident query, creating it when none is live. */
  openSessionStream(params: ClaudeSessionQueryEnsureParams): ClaudeSessionStream {
    if (!isTauriRuntime()) {
      return createSessionStream(
        params.sessionId,
        Promise.reject(new Error('Claude execution is available inside the desktop app.')),
      )
    }
    return createSessionStream(
      params.sessionId,
      requestFromDesktop('claudeSessionQueryEnsure', params),
    )
  },
  /** Stop the session's query, run transcript surgery, and return the fresh stream. */
  rebuildSessionStream(params: ClaudeSessionQueryRebuildParams): ClaudeSessionStream {
    if (!isTauriRuntime()) {
      return createSessionStream(
        params.sessionId,
        Promise.reject(new Error('Claude execution is available inside the desktop app.')),
      )
    }
    return createSessionStream(
      params.sessionId,
      requestFromDesktop('claudeSessionQueryRebuild', params),
    )
  },
  async recycleCheckSessionQuery(sessionId: string) {
    if (!isTauriRuntime()) return { recycled: true, busy: [] as string[] }
    return requestFromDesktop('claudeSessionQueryRecycleCheck', { sessionId })
  },
  /** Switch the resident query to a same-class model; false means "rebuild instead". */
  async setSessionQueryModel(sessionId: string, model: string) {
    if (!isTauriRuntime()) return { applied: true as const }
    return requestFromDesktop('claudeSessionQuerySetModel', { sessionId, model })
  },
  async closeSessionQuery(sessionId: string) {
    if (!isTauriRuntime()) return
    return requestFromDesktop('claudeSessionQueryClose', { sessionId })
  },
  async purgeDeadPairs(params: { projectId: string; sessionId: string }) {
    if (!isTauriRuntime()) return { removed: 0 }
    return requestFromDesktop('claudeSessionPurgeDeadPairs', params)
  },
  async listProviders() {
    if (!isTauriRuntime()) {
      return []
    }

    const providers = await requestFromDesktop('claudeListProviders', {})
    return Array.isArray(providers) ? providers : []
  },
  async getDefaultModel() {
    if (!isTauriRuntime()) {
      return null
    }

    const defaultModel = await requestFromDesktop('claudeGetDefaultModel', {})
    return typeof defaultModel === 'string' && defaultModel ? defaultModel : null
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
  async saveDefaultModel(defaultModel: string | null) {
    if (!isTauriRuntime()) {
      return defaultModel
    }

    return requestFromDesktop('claudeSaveDefaultModel', { defaultModel })
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
  async saveImage(params: ClaudeSaveImageParams): Promise<ClaudeSaveImageResult> {
    if (!isTauriRuntime()) return { path: null }
    return requestFromDesktop('claudeSaveImage', params)
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
  async listProjectGitBranches(projectPath: string): Promise<RpcGitBranchRef[] | null> {
    if (!isTauriRuntime()) {
      return null
    }

    if (import.meta.env.DEV) {
      const mock = await import('./mock')
      if (projectPath === mock.MOCK_PROJECT.path) {
        return null
      }
    }
    return requestFromDesktop('claudeListProjectGitBranches', { projectPath })
  },
  async switchProjectGitBranch(params: {
    projectPath: string
    branch: string
    create?: boolean
  }): Promise<RpcGitBranchSwitchResult> {
    if (!isTauriRuntime()) {
      return { branch: null, error: 'Switching branches requires the desktop runtime' }
    }

    return requestFromDesktop('claudeSwitchProjectGitBranch', params)
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
