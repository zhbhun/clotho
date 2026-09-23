import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import type { WebviewLogBatch } from './logging'
import type { ClaudeModelMappingRole, ProviderApiType } from './provider'
import type { DraftSession, DraftSessionIndex, LocalSession } from './session'
import type { ShortcutBinding, ShortcutOverrides } from './shortcuts'

export type { DraftSession, DraftSessionIndex, LocalSession, SessionInput } from './session'

export type { ClaudeModelMappingRole, ProviderModelReasoning } from './provider'

/** Shape of one side of the desktop RPC contract (requests + push messages). */
export type RPCSchemaSide<Config extends RPCSchemaSideConfig> = Config

interface RPCSchemaSideConfig {
  requests: Record<string, { params: unknown; response: unknown }>
  messages: Record<string, unknown>
}

export type AppLanguage =
  | 'de'
  | 'en'
  | 'es'
  | 'fr'
  | 'hi'
  | 'id'
  | 'ja'
  | 'ko'
  | 'pt-BR'
  | 'ru'
  | 'tr'
  | 'vi'
  | 'zh-CN'
  | 'zh-TW'

export type AppLanguagePreference = AppLanguage | 'system'
export type AppTheme = 'dark' | 'light' | 'system'
export type AppReducedMotionPreference = 'system' | 'reduce' | 'no-preference'
export type AppDefaultPermissionMode =
  'default' | 'acceptEdits' | 'auto' | 'plan' | 'bypassPermissions'

export interface AppThemePalette {
  accent: string
  background: string
  foreground: string
  preset: string
}

export interface AppAppearancePreferences {
  theme: AppTheme
  pointerCursor: boolean
  reducedMotion: AppReducedMotionPreference
  themePalettes: {
    dark: AppThemePalette
    light: AppThemePalette
  }
}

export interface AppPreferences {
  language: AppLanguagePreference
  defaultPermissionMode: AppDefaultPermissionMode
  appearance: AppAppearancePreferences
}

export type ProjectIconName =
  | 'book-open'
  | 'briefcase'
  | 'chart'
  | 'code-xml'
  | 'flask-conical'
  | 'folder'
  | 'folder-code'
  | 'folder-kanban'
  | 'globe'
  | 'graduation-cap'
  | 'heart'
  | 'music'
  | 'palette'
  | 'paw-print'
  | 'pen-tool'
  | 'pencil'
  | 'terminal'
  | 'wrench'

export type ProjectIconColor =
  'neutral' | 'red' | 'orange' | 'amber' | 'green' | 'blue' | 'violet' | 'pink'

export type ProjectIcon =
  | { type: 'preset'; name: ProjectIconName; color: ProjectIconColor }
  | { type: 'custom'; dataUrl: string }

export interface ClaudeProject {
  id: string
  workspace_id?: string
  path: string
  name?: string
  icon?: ProjectIcon
  /** Extra absolute directories Claude may access beyond the project path. */
  additional_directories?: string[]
  /** The homedir-backed default project that owns home-mode conversations. */
  is_home?: boolean
  sessions: string[]
  created_at: number
  most_recent_session?: number
  last_opened_at?: number
  default_provider_id?: string
  default_model_id?: string
}

export interface ClaudeCreateProjectParams {
  path: string
  name: string
  icon?: ProjectIcon
  additionalDirectories?: string[]
}

export interface ClaudeUpdateProjectParams {
  projectId: string
  name: string
  icon?: ProjectIcon | null
  additionalDirectories?: string[]
}

export interface ClaudeSelectProjectFolderParams {
  startingFolder?: string
}

export interface ClaudeSession {
  id: string
  project_id: string
  project_path: string
  created_at: number
  title: string
  custom_title?: string
  ai_title?: string
  first_prompt?: string
  git_branch?: string
  tag?: string
}

export interface ClaudeSubagent {
  id: string
  agentType: string
  description: string
  toolUseId: string
  spawnDepth: number
  createdAt: string
}

export type ClaudeWorkflowStatus =
  'starting' | 'running' | 'completed' | 'failed' | 'stopped' | 'unknown'

export interface ClaudeWorkflowPhase {
  index: number
  title: string
  detail?: string
}

export interface ClaudeWorkflowAgent {
  index: number
  label: string
  phaseIndex: number
  phaseTitle?: string
  agentId?: string
  model?: string
  fallbackModel?: string
  state: string
  startedAt?: number
  queuedAt?: number
  attempt?: number
  lastToolName?: string
  lastToolSummary?: string
  promptPreview?: string
  lastProgressAt?: number
  tokens?: number
  toolCalls?: number
  durationMs?: number
  resultPreview?: string
}

export interface ClaudeWorkflowRun {
  runId: string
  isPartial?: boolean
  taskId?: string
  workflowName?: string
  summary?: string
  status: ClaudeWorkflowStatus
  startTime?: number
  durationMs?: number
  agentCount?: number
  totalTokens?: number
  totalToolCalls?: number
  script?: string
  logs?: string[]
  result?: unknown
  phases: ClaudeWorkflowPhase[]
  agents: ClaudeWorkflowAgent[]
}

export interface ClaudeWorkflowRunsParams {
  sessionId: string
  projectId: string
  runIds: string[]
}

export interface ClaudeImageSource {
  type?: string
  data?: string
  media_type?: string
}

export interface ClaudeImageSource {
  type?: string
  data?: string
  media_type?: string
  /** Original absolute source path kept alongside stored attachment content. */
  path?: string | null
}

export interface ClaudeContentPart {
  type?: string
  id?: string
  text?: string
  thinking?: string
  name?: string
  title?: string
  tool_use_id?: string
  input?: unknown
  content?: string | ClaudeContentPart[]
  source?: ClaudeImageSource
  is_error?: boolean
}

export interface ClaudeJsonLine {
  type?: string
  subtype?: string
  commands?: ClaudeSlashCommand[]
  session_id?: string
  timestamp?: string
  isMeta?: boolean
  uuid?: string
  parentUuid?: string
  teamName?: string
  cwd?: string
  model?: string
  result?: string
  user_message_uuid?: string
  user_message_uuids?: string[]
  message?: {
    role?: string
    content?: string | ClaudeContentPart[]
  }
  [key: string]: unknown
}

export type ClaudePermissionMode =
  'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'dontAsk' | 'auto'

export interface ClaudeOptions {
  cwd?: string
  sessionId?: string
  resume?: string
  resumeSessionAt?: string
  enableFileCheckpointing?: boolean
  model?: string
  permissionMode?: ClaudePermissionMode
  agent?: string
  continue?: boolean
  maxTurns?: number
  allowedTools?: string[]
  disallowedTools?: string[]
  additionalDirectories?: string[]
}

export interface ClaudeStartupParams {
  options?: ClaudeOptions
  initializeTimeoutMs?: number
}

export interface ClaudeSessionEditAnchorParams {
  sessionId: string
  projectId: string
  messageId: string
}

export type ClaudeSessionEditAnchor =
  { strategy: 'fresh' } | { strategy: 'resume'; resumeSessionAt: string }

export interface ClaudeRewindSessionFilesParams {
  sessionId: string
  projectId: string
  userMessageId: string
  dryRun?: boolean
}

export interface ClaudeDropTrailingTurnParams {
  projectId: string
  /** Known session file; when omitted the project transcript directory is scanned by uuid. */
  sessionId?: string
  /** Uuid of the recalled user message whose trailing turn should be removed. */
  userMessageUuid: string
}

export interface ClaudeDropTrailingTurnResult {
  /** Whether the trailing turn was found and removed from the transcript. */
  dropped: boolean
  /** Whether the whole session file was deleted (the turn was the only content). */
  removedSession: boolean
}

export interface ClaudeSampleContextUsageParams {
  cwd?: string
  sessionId?: string
  model?: string
  initializeTimeoutMs?: number
}

export interface ClaudeRewindFilesResult {
  canRewind: boolean
  error?: string
  filesChanged?: string[]
  insertions?: number
  deletions?: number
}

export type ClaudeAttachmentContent =
  | {
      type: 'image'
      source: {
        type: 'base64'
        media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
        data: string
        path?: string | null
      }
    }
  | {
      type: 'document'
      title?: string
      source:
        | { type: 'base64'; media_type: 'application/pdf'; data: string; path?: string | null }
        | { type: 'text'; media_type: 'text/plain'; data: string; path?: string | null }
    }

export type ClaudeAttachment = { name: string } & (
  { path: string; content?: never } | { path?: never; content: ClaudeAttachmentContent }
)

export interface ClaudeAttachmentPreviewParams {
  path: string
}

export interface ClaudeAttachmentPreview {
  dataUrl: string | null
}

export interface ClaudePrepareAttachmentsParams {
  attachments: ClaudeAttachment[]
}

export interface ClaudePreparedAttachments {
  attachments: ClaudeAttachment[]
}

export interface ClaudeAttachmentReadParams {
  files: {
    name: string
    /** Absolute source path; omit when reading raw bytes. */
    sourcePath?: string
    /** Raw file bytes encoded as base64; used for clipboard pastes. */
    data?: string
  }[]
}

export interface ClaudeLoadedAttachment {
  name: string
  /** Original absolute source path; null for clipboard pastes. */
  path: string | null
  content: ClaudeAttachmentContent
}

export type ClaudeAttachmentRejectReason = 'unsupported' | 'too-large' | 'unreadable' | 'empty'

export interface ClaudeAttachmentReadResult {
  attachments: ClaudeLoadedAttachment[]
  rejected: { name: string; reason: ClaudeAttachmentRejectReason }[]
}

export interface ClaudeQueryParams {
  prompt: string
  attachments?: ClaudeAttachment[]
  /** Client-generated ID used to correlate SDK assistant/result messages with this prompt. */
  userMessageUuid?: string
  /**
   * Send the prompt as a synthetic SDK user message with this origin kind instead of a
   * human-origin one. Used by the auto-continuation nudge that resumes an interrupted
   * turn: the message is hidden from the conversation list and never recalled.
   */
  syntheticOrigin?: 'auto-continuation'
  options?: ClaudeOptions
}

export interface ClaudeSelectFilesParams {
  startingFolder?: string
  allowsMultipleSelection?: boolean
}

export type ProjectFileSearchReason =
  | 'missing-project'
  | 'unsafe-root'
  | 'search-unavailable'
  | 'timeout'
  | 'too-many-files'
  | 'unknown'

export type ProjectFileSearchStrategy = 'fff' | 'git' | 'rg' | 'walker' | 'none'
export type ProjectFileSearchEntryKind = 'directory' | 'file'
export type ProjectFileSearchRanking = 'fuzzy' | 'path' | 'root'
export type ProjectFileSearchSource = 'fallback' | 'fff' | 'git' | 'rg' | 'root' | 'walker'

export interface ProjectFileSearchParams {
  projectPath?: string
}

export interface ProjectFileSearchListParams extends ProjectFileSearchParams {
  limit?: number
}

export interface ProjectFileSearchQueryParams extends ProjectFileSearchListParams {
  query: string
}

export interface ProjectFileSearchOutlineParams extends ProjectFileSearchParams {
  relativePath: string
}

export interface ProjectFileSearchCapability {
  supported: boolean
  reason?: ProjectFileSearchReason
  message?: string
  projectPath?: string
  isGit: boolean
  trackedFileCount?: number
  strategy: ProjectFileSearchStrategy
}

export interface ProjectFileSearchMatchRange {
  field: 'name' | 'relativePath'
  start: number
  end: number
}

export interface ProjectFileSearchEntry {
  absolutePath: string
  displayPath: string
  kind: ProjectFileSearchEntryKind
  matchRanges?: ProjectFileSearchMatchRange[]
  name: string
  ranking: ProjectFileSearchRanking
  relativePath: string
  score?: number
  source: ProjectFileSearchSource
}

export interface ProjectFileSearchResult {
  supported: boolean
  reason?: ProjectFileSearchReason
  message?: string
  items: ProjectFileSearchEntry[]
  query: string
  ranking?: ProjectFileSearchRanking
  source?: ProjectFileSearchSource
}

export interface ProjectFileSearchOutlineNode {
  kind: ProjectFileSearchEntryKind
  name: string
  relativePath: string
}

export interface ProjectFileSearchOutline {
  supported: boolean
  reason?: ProjectFileSearchReason
  message?: string
  nodes: ProjectFileSearchOutlineNode[]
}

export type ClaudeStreamId = string

export type ClaudeFollowState = 'processing' | 'idle' | 'interrupted'

export type ClaudeQueryStartParams = ClaudeQueryParams & {
  streamId: ClaudeStreamId
}

export type ClaudeQueryControlCommand =
  | 'interrupt'
  | 'rewindFiles'
  | 'setPermissionMode'
  | 'setModel'
  | 'setMaxThinkingTokens'
  | 'applyFlagSettings'
  | 'initializationResult'
  | 'reinitialize'
  | 'supportedCommands'
  | 'supportedModels'
  | 'supportedAgents'
  | 'mcpServerStatus'
  | 'accountInfo'
  | 'reconnectMcpServer'
  | 'toggleMcpServer'
  | 'setMcpServers'
  | 'stopTask'
  | 'getContextUsage'

/** One row of the context-window usage breakdown (subset of the SDK report the panel renders). */
interface ClaudeContextUsageCategory {
  name: string
  tokens: number
}

/** Slim snapshot of the SDK context-window usage report, sampled while a query is alive. */
export interface ClaudeContextUsageSnapshot {
  model: string
  totalTokens: number
  maxTokens: number
  rawMaxTokens: number
  percentage: number
  categories: ClaudeContextUsageCategory[]
}

export interface ClaudeQueryControlParams {
  streamId: ClaudeStreamId
  command: ClaudeQueryControlCommand
  params?: unknown[]
}

export interface ClaudeQueryStreamInputStartParams {
  streamId: ClaudeStreamId
  inputStreamId: string
}

export interface ClaudeQueryStreamInputMessageParams {
  streamId: ClaudeStreamId
  inputStreamId: string
  message: SDKUserMessage
}

export interface ClaudeQueryStreamInputCompleteParams {
  streamId: ClaudeStreamId
  inputStreamId: string
}

export interface ClaudeQueryStreamInputErrorParams {
  streamId: ClaudeStreamId
  inputStreamId: string
  message: string
}

/**
 * A request reported when the underlying canUseTool routes a decision to the host.
 * - `ask`: The agent asks for clarification (AskUserQuestion) → replace the floating form above the input.
 * - `permission`: A tool requests execution permission (such as a write) → show an authorization button on its card.
 */
export interface ClaudeToolRequest {
  kind: 'ask' | 'permission'
  toolUseId: string
  toolName?: string
  input?: unknown
  title?: string
  displayName?: string
  description?: string
}

/**
 * The host's response to ClaudeToolRequest, used directly as the SDK PermissionResult.
 * - allow + updatedInput: allow the request and inject returned data (such as AskUserQuestion answers) into the tool input.
 * - deny: reject the request with a reason.
 */
export type ClaudeToolResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message: string }

export interface ClaudeToolResponse {
  toolUseId: string
  result: ClaudeToolResult
}

export interface ClaudeStreamToolResponse extends ClaudeToolResponse {
  streamId: ClaudeStreamId
}

export interface ClaudeModelInfo {
  value: string
  displayName: string
  description: string
  providerId?: string
  providerName?: string
  contextWindow?: number
  /** Whether the model accepts multimodal attachments; undefined falls back to capable. */
  supportsMultimodal?: boolean
  supportsEffort?: boolean
  supportedEffortLevels?: ('low' | 'medium' | 'high' | 'xhigh' | 'max')[]
  supportsAdaptiveThinking?: boolean
  supportsFastMode?: boolean
}

/** A single model belonging to a provider. */
export interface ProviderModel {
  id: string
  displayName: string
  contextWindow: number
  /** Whether the model accepts multimodal attachments; undefined falls back to capable. */
  supportsMultimodal?: boolean
  /**
   * The model's selected thinking level (a model-native level from the linked
   * reasoning preset, e.g. `high` or `on`). Also the fallback for requests
   * whose effort is outside the preset mapping. Undefined falls back to `on`.
   */
  thinkingLevel?: string
  /**
   * Id of the reasoning preset linked to this model. The preset provides the
   * selectable model levels and their mapping to Claude effort levels, which
   * the local proxy uses to translate requests. Undefined pins
   * `thinkingLevel` unconditionally.
   */
  thinkingPresetId?: string
}

/** A third-party Claude-compatible endpoint and its model list. */
export interface ModelProvider {
  id: string
  name: string
  baseURL: string
  authToken: string
  /** Upstream API dialect; undefined falls back to Anthropic Messages. */
  apiType?: ProviderApiType
  models: ProviderModel[]
  /** Source preset ID; when present, the preset came from the built-in list. */
  presetId?: string
  /** Override the exact models endpoint used when fetching models. */
  modelsUrl?: string
}

/** Global mapping from Claude built-in roles to local proxy qualified models (providerId/modelId). */
export type ClaudeModelMappings = Partial<Record<ClaudeModelMappingRole, string>>

/** The selected provider and model for a session or project. */
export interface ProviderModelSelection {
  providerId: string
  modelId: string
}

/** Parameters for fetching a provider's available models. */
export interface FetchProviderModelsParams {
  baseURL: string
  authToken: string
  /** Override the exact models endpoint used by candidate discovery. */
  modelsUrl?: string
}

/** One usage window of a provider plan (five-hour, weekly, monthly, balance, ...). */
export interface ProviderUsageWindow {
  /** Window identifier shared with i18n keys, e.g. `fiveHour`, `weekly`, `monthly`, `balance`. */
  name: string
  /** Used percentage 0–100; present when the provider reports a percentage window. */
  utilization?: number
  /** Remaining amount; present when the provider reports a balance instead of a percentage. */
  remaining?: number
  /** Currency or unit of `remaining`, e.g. `CNY`, `USD`. */
  unit?: string
  /** ISO 8601 reset time; null when the provider does not report one right now. */
  resetsAt: string | null
}

/** Result of querying one provider's remaining quota and reset time. */
export interface ProviderUsageQuota {
  success: boolean
  /** Plan level reported by the provider, e.g. Zhipu's `glm-4.7-plan`; informational. */
  planLabel?: string
  windows: ProviderUsageWindow[]
  /** Deterministic failure message; absent on success. */
  error?: string
  /** Query completion time in epoch milliseconds. */
  queriedAt: number
}

/** Parameters for querying a provider's remaining quota. */
export interface GetProviderUsageParams {
  baseURL: string
  authToken: string
}

export interface ClaudeSlashCommand {
  name: string
  description?: string
  aliases?: string[]
  argumentHint?: string
}

export interface ClaudeAgentInfo {
  name: string
  description: string
  model?: string
}

export interface ClaudeAccountInfo {
  email?: string
  organization?: string
  subscriptionType?: string
  tokenSource?: string
  apiKeySource?: string
  apiProvider?:
    'firstParty' | 'bedrock' | 'vertex' | 'foundry' | 'anthropicAws' | 'mantle' | 'gateway'
}

export interface ClaudeInitializationResult {
  cwd: string
  resume?: string
  commands: ClaudeSlashCommand[]
  agents: ClaudeAgentInfo[]
  models: ClaudeModelInfo[]
  /** Clotho desktop startup includes this; SDK control responses may omit it. */
  providers?: ModelProvider[]
  /** Clotho desktop startup includes this; SDK control responses may omit it. */
  modelMappings?: ClaudeModelMappings
  hasClaudeAuthentication?: boolean
  hasConfiguredProviders?: boolean
  account?: ClaudeAccountInfo
  output_style?: string
  available_output_styles?: string[]
  fast_mode_state?: 'off' | 'cooldown' | 'on'
}

export type DesktopRPC = {
  main: RPCSchemaSide<{
    requests: {
      claudeStartup: {
        params: ClaudeStartupParams
        response: ClaudeInitializationResult
      }
      claudeQueryStart: {
        params: ClaudeQueryStartParams
        response: void
      }
      claudeQueryControl: {
        params: ClaudeQueryControlParams
        response: unknown
      }
      claudeQueryClose: {
        params: { streamId: ClaudeStreamId }
        response: void
      }
      claudeQueryStreamInputStart: {
        params: ClaudeQueryStreamInputStartParams
        response: void
      }
      claudeQueryStreamInputMessage: {
        params: ClaudeQueryStreamInputMessageParams
        response: void
      }
      claudeQueryStreamInputComplete: {
        params: ClaudeQueryStreamInputCompleteParams
        response: void
      }
      claudeQueryStreamInputError: {
        params: ClaudeQueryStreamInputErrorParams
        response: void
      }
      claudeListProjects: {
        params: Record<string, never>
        response: ClaudeProject[]
      }
      applicationMenuSetLanguage: {
        params: { language: AppLanguage }
        response: void
      }
      appGetPreferences: {
        params: Record<string, never>
        response: AppPreferences
      }
      appSavePreferences: {
        params: { preferences: AppPreferences }
        response: AppPreferences
      }
      claudeAddProjectFromFolder: {
        params: Record<string, never>
        response: ClaudeProject | null
      }
      claudeSelectProjectFolder: {
        params: ClaudeSelectProjectFolderParams
        response: string | null
      }
      claudeCreateProject: {
        params: ClaudeCreateProjectParams
        response: ClaudeProject
      }
      claudeUpdateProject: {
        params: ClaudeUpdateProjectParams
        response: ClaudeProject
      }
      claudeRemoveProject: {
        params: { projectId: string }
        response: void
      }
      claudeSelectFiles: {
        params: ClaudeSelectFilesParams
        response: string[]
      }
      claudeGetAttachmentPreview: {
        params: ClaudeAttachmentPreviewParams
        response: ClaudeAttachmentPreview
      }
      claudePrepareAttachments: {
        params: ClaudePrepareAttachmentsParams
        response: ClaudePreparedAttachments
      }
      attachmentRead: {
        params: ClaudeAttachmentReadParams
        response: ClaudeAttachmentReadResult
      }
      claudeCanSearchProjectFiles: {
        params: ProjectFileSearchParams
        response: ProjectFileSearchCapability
      }
      claudeListProjectRootEntries: {
        params: ProjectFileSearchListParams
        response: ProjectFileSearchResult
      }
      claudeEnterProjectFileSearchWarmup: {
        params: ProjectFileSearchParams
        response: ProjectFileSearchCapability
      }
      claudeExitProjectFileSearchWarmup: {
        params: ProjectFileSearchParams
        response: void
      }
      claudeSearchProjectFiles: {
        params: ProjectFileSearchQueryParams
        response: ProjectFileSearchResult
      }
      claudeGetProjectFileOutline: {
        params: ProjectFileSearchOutlineParams
        response: ProjectFileSearchOutline
      }
      claudeSetProjectLastOpened: {
        params: { projectId: string }
        response: void
      }
      claudeListSessions: {
        params: { projectId: string }
        response: ClaudeSession[]
      }
      sessionListDrafts: { params: Record<string, never>; response: DraftSessionIndex }
      sessionRead: { params: { sessionId: string }; response: LocalSession | null }
      sessionWrite: {
        params: { sessionId: string; data: LocalSession; draft?: DraftSession }
        response: void
      }
      sessionUpdateDraft: { params: { sessionId: string; draft: DraftSession }; response: void }
      sessionCompleteDraft: { params: { sessionId: string }; response: void }
      sessionBindOwner: {
        params: { sessionId: string; projectId: string | null; claudeSessionId: string }
        response: void
      }
      sessionDelete: { params: { sessionId: string }; response: void }
      sessionDeleteProject: { params: { projectId: string }; response: void }
      claudeGetSessionMessages: {
        params: { sessionId: string; projectId: string }
        response: ClaudeJsonLine[]
      }
      claudeGetWorkflowRuns: {
        params: ClaudeWorkflowRunsParams
        response: ClaudeWorkflowRun[]
      }
      claudeListSubagents: {
        params: { sessionId: string; projectId: string }
        response: ClaudeSubagent[]
      }
      claudeGetSubagentMessages: {
        params: { sessionId: string; projectId: string; agentId: string }
        response: ClaudeJsonLine[]
      }
      claudeForkSession: {
        params: { sessionId: string; projectId: string; messageId: string }
        response: { sessionId: string }
      }
      claudeGetSessionEditAnchor: {
        params: ClaudeSessionEditAnchorParams
        response: ClaudeSessionEditAnchor
      }
      claudeRewindSessionFiles: {
        params: ClaudeRewindSessionFilesParams
        response: ClaudeRewindFilesResult
      }
      claudeDropTrailingTurn: {
        params: ClaudeDropTrailingTurnParams
        response: ClaudeDropTrailingTurnResult
      }
      claudeSampleContextUsage: {
        params: ClaudeSampleContextUsageParams
        response: ClaudeContextUsageSnapshot | null
      }
      claudeGetProjectGitBranch: {
        params: { projectPath: string }
        response: string | null
      }
      claudeRenameSession: {
        params: { projectId: string; sessionId: string; title: string }
        response: void
      }
      claudeDeleteSession: {
        params: { projectId: string; sessionId: string }
        response: void
      }
      claudeRespondToolRequest: {
        params: ClaudeStreamToolResponse
        response: void
      }
      claudeListProviders: {
        params: Record<string, never>
        response: ModelProvider[]
      }
      claudeListModelMappings: {
        params: Record<string, never>
        response: ClaudeModelMappings
      }
      claudeCreateProvider: {
        params: { provider: ModelProvider }
        response: ModelProvider
      }
      claudeUpdateProvider: {
        params: { provider: ModelProvider }
        response: ModelProvider
      }
      claudeDeleteProvider: {
        params: { id: string }
        response: void
      }
      claudeSaveModelMappings: {
        params: { models: ClaudeModelMappings }
        response: ClaudeModelMappings
      }
      claudeSetProjectModel: {
        params: { projectId: string; providerId: string; modelId: string }
        response: void
      }
      claudeFetchProviderModels: {
        params: FetchProviderModelsParams
        response: string[]
      }
      claudeGetProviderUsage: {
        params: GetProviderUsageParams
        response: ProviderUsageQuota
      }
      claudeFollowStart: {
        params: { projectId: string; sessionId: string }
        response: void
      }
      claudeFollowStop: {
        params: { sessionId: string }
        response: void
      }
      shortcutGetOverrides: {
        params: Record<string, never>
        response: ShortcutOverrides
      }
      shortcutSetOverride: {
        params: { commandId: string; bindings: ShortcutBinding[] }
        response: ShortcutOverrides
      }
      shortcutResetOverride: {
        params: { commandId: string }
        response: ShortcutOverrides
      }
      windowToggleMaximize: {
        params: Record<string, never>
        response: void
      }
    }
    messages: {
      appLogBatch: WebviewLogBatch
    }
  }>
  renderer: RPCSchemaSide<{
    requests: Record<string, never>
    messages: {
      claudeOutput: { streamId: ClaudeStreamId; message: SDKMessage }
      claudeError: { streamId: ClaudeStreamId; message: string; stack?: string }
      claudeComplete: { streamId: ClaudeStreamId; success: boolean }
      claudeToolRequest: { streamId: ClaudeStreamId; request: ClaudeToolRequest }
      claudeFollowUpdate: { sessionId: string; lines: ClaudeJsonLine[] }
      claudeFollowState: { sessionId: string; state: ClaudeFollowState }
      claudeFollowReset: { sessionId: string }
    }
  }>
}
