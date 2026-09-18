import type { ClaudeAttachment } from '@/shared/rpc'

import type {
  ClaudePermissionMode,
  ClaudeRewindFilesResult,
  ClaudeSessionEditAnchor,
} from '../../../services/claude/claude'
import { claude } from '../../../services/claude/claude'
import type { ModelConfigurationStore } from '../../../stores/model-configuration-store'
import type { SessionPersistence } from '../services/session-persistence'
import type { SessionActivityEvent } from '../stores/workbench-store'
import type { ClaudeContentBlock } from './services/message'

export type SessionRuntimeStatus = 'idle' | 'loading' | 'ready' | 'streaming' | 'error'

export type SessionTool = ClaudeContentBlock & {
  id: string
  messageId: string
}

export type SessionContext = {
  claudeSessionId: string | null
  projectId: string | null
  projectPath: string | null
  additionalDirectories?: string[]
  sessionTitle?: string
  defaultProviderId?: string
  defaultModelId?: string
  isHomeMode: boolean
  isMockProject: boolean
}

export type SessionComposerDraft = {
  prompt: string
  attachments: ClaudeAttachment[]
}

export type MessageEditDraft = {
  messageId: string
  messageUuid: string
  prompt: string
  attachments?: ClaudeAttachment[]
  providerId: string
  modelId: string
  permissionMode: ClaudePermissionMode
}

export type MessageEditPreparation =
  | {
      status: 'confirm'
      editTarget: ClaudeSessionEditAnchor
      preview: ClaudeRewindFilesResult
    }
  | { status: 'error' | 'sent' }

export type TurnFailure = {
  elapsed: number
  message: string
}

export type SessionClient = Pick<
  typeof claude,
  | 'deleteSession'
  | 'dropTrailingTurn'
  | 'followSession'
  | 'getSessionEditAnchor'
  | 'listModelMappings'
  | 'listProviders'
  | 'loadSessionHistory'
  | 'prepareAttachments'
  | 'query'
  | 'rewindSessionFiles'
  | 'sampleContextUsage'
  | 'startup'
  | 'setProjectModel'
>

export type SessionControllerOptions = SessionContext & {
  sessionId: string
  persistence?: SessionPersistence
  getDefaultPermissionMode?: () => ClaudePermissionMode
  client?: SessionClient
  modelConfigurationStore?: ModelConfigurationStore
  onBindClaudeSession?: (sessionId: string, claudeSessionId: string) => void
  onPromptRecalled?: (sessionId: string) => void
  onActivityChange?: (sessionId: string, activity: SessionActivityEvent) => void
  onPromptEdited?: (sessionId: string) => void
  onPromptStarted?: (sessionId: string) => void
  onStartNewSession?: (draft?: SessionComposerDraft) => void
  onProjectDefaultModelChange?: (projectId: string, providerId: string, modelId: string) => void
  onModelConfigurationRequired?: () => void
  onRefreshCatalog?: () => void | Promise<void>
}
