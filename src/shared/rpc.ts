import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

import type { WebviewLogBatch } from './logging'
import type { ProviderApiType } from './provider'
import type { DraftSession, DraftSessionIndex, LocalSession } from './session'
import type { ShortcutBinding, ShortcutOverrides } from './shortcuts'

/** Settings categories the application menu can deep-link into. */
export type MenuSettingsCategory = 'shortcuts'

/** A free window that switches projects, or a window bound to a single project. */
export type WindowKind = 'free' | 'project'

/** How a renderer learns which window it is running in. */
export interface WindowDescription {
  id: string
  kind: WindowKind
  /** The bound project of a project window; null for a free window. */
  projectId: string | null
  /** Projects currently shown by a project window. */
  pinnedProjectIds: string[]
}

/** A renderer workspace context: the home surface or one project's surface. */
export type WorkspaceKey = 'claude' | `project:${string}`

/** A free window's persisted ui: every workspace it holds and which one is showing. */
export interface WorkbenchWindowUiState {
  currentWorkspaceKey: WorkspaceKey
  sessionTabsByWorkspace: Record<string, string[]>
  activeSessionByWorkspace: Record<string, string | null>
}

/** A project's persisted workspace: its open session tabs and the active one. */
export interface ProjectUiState {
  sessionIds: string[]
  activeSessionId: string | null
}

/** The result of asking a project window to show another project. */
export type WindowRefocusResult =
  { outcome: 'refocused'; ui: ProjectUiState | null } | { outcome: 'shown-elsewhere' }

export type { DraftSession, DraftSessionIndex, LocalSession, SessionInput } from './session'

export type { ProviderModelReasoning } from './provider'

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

/** Inactivity days before a session is archived automatically; 0 disables the sweep. */
export type AppArchiveInactiveDays = 0 | 1 | 2 | 7 | 14

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
  archiveInactiveSessions: AppArchiveInactiveDays
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

/**
 * `preset` icons can no longer be picked but stay valid: projects saved by
 * older builds keep rendering their original lucide icon.
 */
export type ProjectIcon =
  | { type: 'preset'; name: ProjectIconName; color: ProjectIconColor }
  | { type: 'emoji'; char: string }
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
  /** SDK lastModified in seconds; drives inactivity checks and recency ordering. */
  updated_at?: number
  archived?: boolean
  archived_at?: number
  unarchived_at?: number
  /** When the session was pinned (seconds); presence marks it pinned. */
  pinned_at?: number
  /** Unread activity kind recorded when a run finished while the session was not active. */
  unread?: 'success' | 'error'
}

export interface GitBranchRef {
  name: string
  isCurrent: boolean
}

export interface GitBranchSwitchResult {
  /** The checked out branch on success; null when the operation failed. */
  branch: string | null
  /** Git's failure detail; null on success. */
  error: string | null
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
  /**
   * A historical edit intentionally discards every later turn, so the
   * newer-conversation refusal is skipped; a recall keeps it.
   */
  allowLaterConversation?: boolean
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

export interface ClaudeSaveImageParams {
  name: string
  dataUrl: string
}

export interface ClaudeSaveImageResult {
  /** Absolute path the image was written to, or null when the dialog was canceled. */
  path: string | null
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

// --- Session-keyed long-lived queries (one reused query per clotho session) --

/** Liveness snapshot of a session's long-lived query, reported on attach. */
export interface ClaudeSessionStreamState {
  claudeSessionId: string | null
  status: 'starting' | 'ready' | 'dead'
  turnInFlight: boolean
  pendingToolRequests: ClaudeToolRequest[]
  /** Live non-ambient background task ids (the CLI's level signal). */
  backgroundTaskIds: string[]
  /** The qualified model the query was created with (or last switched to). */
  model?: string
  /** The agent the query was created with, when one was picked. */
  agent?: string
}

/** Broadcast whenever a session query's live shape changes in the main process. */
export type ClaudeSessionRuntimeChanged = {
  sessionId: string
  /** Null once the query is gone (recycled, rebuilt, or ended). */
  streamId: ClaudeStreamId | null
  turnInFlight: boolean
  pendingToolRequestIds: string[]
}

export type ClaudeSessionQueryEnsureParams = {
  /** The clotho session id that owns the query. */
  sessionId: string
  /** Resume this Claude session when the query has to be created. */
  claudeSessionId?: string
  options: ClaudeOptions
}

export type ClaudeSessionQueryEnsureResult = {
  streamId: ClaudeStreamId
  state: ClaudeSessionStreamState
  /** Frames emitted since the last result message, replayed on re-attach. */
  replay: SDKMessage[]
}

export type ClaudeSessionQueryPushParams = {
  streamId: ClaudeStreamId
  text: string
  attachments?: ClaudeAttachment[]
  userMessageUuid?: string
  syntheticOrigin?: 'auto-continuation'
}

export type ClaudeSessionQueryRebuildReason = 'edit' | 'model-class' | 'agent' | 'recovery'

export type ClaudeSessionQueryRebuildParams = {
  sessionId: string
  claudeSessionId?: string
  options: ClaudeOptions
  reason: ClaudeSessionQueryRebuildReason
  /** Drop the transcript from this user message onward before restarting. */
  dropFromMessageUuid?: string
  /** Required for transcript surgery; omit to skip it. */
  projectId?: string
}

export type ClaudeSessionQueryRecycleCheckParams = {
  sessionId: string
  /** The window asking; other windows holding the session view block the recycle. */
  windowId?: string
}

/** Params for attaching to (never creating) a session's live query. */
export type ClaudeSessionQueryAttachParams = {
  sessionId: string
}

export type ClaudeSessionQueryRecycleCheckResult = {
  recycled: boolean
  /** Human-readable reasons the query is still busy. */
  busy: string[]
}

export type ClaudeSessionQuerySetModelParams = {
  sessionId: string
  /** The qualified `<provider>/<model>` the next turn should run on. */
  model: string
}

export type ClaudeSessionQuerySetModelResult =
  { applied: true } | { applied: false; reason: 'missing' | 'model-class' }

export type ClaudeSessionQueryCloseParams = {
  sessionId: string
}

export type ClaudePurgeDeadPairsParams = {
  projectId: string
  sessionId: string
}

export type ClaudePurgeDeadPairsResult = {
  /** Number of dead turns removed. */
  removed: number
  removedSession?: boolean
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
  /**
   * App-level default model as a qualified `providerId/modelId` string, used
   * when a session has no explicit model selection. Clotho desktop startup
   * includes this; SDK control responses may omit it.
   */
  defaultModel?: string
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
      claudeQueryControl: {
        params: ClaudeQueryControlParams
        response: unknown
      }
      claudeSessionQueryEnsure: {
        params: ClaudeSessionQueryEnsureParams
        response: ClaudeSessionQueryEnsureResult
      }
      claudeSessionQueryPush: {
        params: ClaudeSessionQueryPushParams
        response: void
      }
      claudeSessionQueryRebuild: {
        params: ClaudeSessionQueryRebuildParams
        response: ClaudeSessionQueryEnsureResult
      }
      claudeSessionQueryAttach: {
        params: ClaudeSessionQueryAttachParams
        /** The live query's snapshot, or null when none is running — never spawns one. */
        response: ClaudeSessionQueryEnsureResult | null
      }
      claudeSessionViewOpened: {
        params: ClaudeSessionQueryAttachParams
        response: void
      }
      claudeSessionViewClosed: {
        params: ClaudeSessionQueryAttachParams
        response: void
      }
      claudeSessionQueryRecycleCheck: {
        params: ClaudeSessionQueryRecycleCheckParams
        response: ClaudeSessionQueryRecycleCheckResult
      }
      claudeSessionQuerySetModel: {
        params: ClaudeSessionQuerySetModelParams
        response: ClaudeSessionQuerySetModelResult
      }
      claudeSessionQueryClose: {
        params: ClaudeSessionQueryCloseParams
        response: void
      }
      claudeSessionPurgeDeadPairs: {
        params: ClaudePurgeDeadPairsParams
        response: ClaudePurgeDeadPairsResult
      }
      claudeListProjects: {
        params: Record<string, never>
        response: ClaudeProject[]
      }
      applicationMenuSetLanguage: {
        params: { language: AppLanguage }
        response: void
      }
      applicationMenuSetCaptureActive: {
        params: { active: boolean }
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
      appOpenLink: {
        params: { href: string; projectPath: string }
        response: { opened: boolean }
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
      claudeSaveImage: {
        params: ClaudeSaveImageParams
        response: ClaudeSaveImageResult
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
      claudeListProjectGitBranches: {
        params: { projectPath: string }
        response: GitBranchRef[] | null
      }
      claudeSwitchProjectGitBranch: {
        params: { projectPath: string; branch: string; create?: boolean }
        response: GitBranchSwitchResult
      }
      claudeRenameSession: {
        params: { projectId: string; sessionId: string; title: string }
        response: void
      }
      claudeSetSessionsArchived: {
        params: { sessions: Array<{ projectId: string; sessionId: string }>; archived: boolean }
        response: void
      }
      claudeSetSessionsPinned: {
        params: {
          sessions: Array<{
            projectId: string | null
            sessionId: string
            claudeSessionId: string | null
          }>
          pinned: boolean
        }
        response: void
      }
      claudeSetSessionsUnread: {
        params: {
          sessions: Array<{
            projectId: string | null
            sessionId: string
            claudeSessionId: string | null
          }>
          unread: 'success' | 'error' | null
        }
        response: void
      }
      /** A free window's whole-window ui payload; project windows use the projectState surfaces. */
      windowReadUiState: {
        params: Record<string, never>
        response: { ui?: WorkbenchWindowUiState }
      }
      windowWriteUiState: { params: { ui: WorkbenchWindowUiState }; response: void }
      /**
       * Stores the calling project window's workspace ui in its project's
       * persisted state. The project is derived from the calling window.
       */
      windowWriteProjectState: { params: { ui: ProjectUiState }; response: void }
      windowDescribe: { params: Record<string, never>; response: WindowDescription }
      /**
       * Opens a project window for a project. When `ui` is given (a pop-out),
       * it seeds the window's workspace; otherwise the project's persisted
       * state is restored. Not opened when a project window already shows the
       * project; that window is brought to the front instead.
       */
      windowOpenProject: {
        params: { projectId: string; ui?: ProjectUiState }
        response: { opened: boolean }
      }
      /**
       * Brings the project window showing a project to the front, if there is
       * one, and optionally asks it to show a session of that project.
       */
      windowFocusProject: {
        params: {
          projectId: string
          session?: { sessionId: string; claudeSessionId: string | null }
        }
        response: { focused: boolean }
      }
      /**
       * Rebinds the calling project window to another project. The ui payload
       * is the caller's state for its current project, persisted as that
       * project's state; the response carries the new project's persisted ui.
       */
      windowRefocus: {
        params: { projectId: string; ui: ProjectUiState }
        response: WindowRefocusResult
      }
      /** A project's persisted workspace ui (tabs and active session), when any. */
      windowReadProjectState: {
        params: { projectId: string }
        response: { ui: ProjectUiState } | null
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
      claudeGetDefaultModel: {
        params: Record<string, never>
        response: string | null
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
      claudeSaveDefaultModel: {
        params: { defaultModel: string | null }
        response: string | null
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
      /** A session's idle query was recycled; its stream has (or will) end. */
      claudeSessionRecycled: { sessionId: string }
      /** A session query's live shape changed; viewers re-attach or reset on it. */
      claudeSessionRuntimeChanged: ClaudeSessionRuntimeChanged
      /** An application menu item triggered a shortcut command. */
      menuCommandDispatch: { commandId: string }
      /** An application menu item asked to open a settings category. */
      menuOpenSettings: { category: MenuSettingsCategory }
      /** The set of projects shown by a project window changed. */
      windowRegistryChanged: { pinnedProjectIds: string[] }
      /** Show a session of this window's project that another window picked. */
      windowSelectSession: { sessionId: string; claudeSessionId: string | null }
      /** Another window changed the project catalog; reload it. */
      catalogChanged: Record<string, never>
    }
  }>
}
