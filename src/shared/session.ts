import type { ClaudeAttachment, ClaudeContextUsageSnapshot, ClaudePermissionMode } from './rpc'

export interface SessionInput {
  prompt: string
  attachments: ClaudeAttachment[]
  model: string | null
  permissionMode: ClaudePermissionMode
  agent: string | null
  /** The user turn whose cancelled input was restored into this composer. */
  recalledFromMessage?: string
}

export interface LocalSession {
  projectId: string | null
  projectPath: string | null
  claudeSessionId: string | null
  input: SessionInput
  contextUsage?: {
    snapshot: ClaudeContextUsageSnapshot
    anchorMessageId: string | null
  }
}

export interface DraftSession {
  title: string
  createdAt: number
  updatedAt: number
  projectId: string | null
  projectPath: string | null
}

export type DraftSessionIndex = Record<string, DraftSession>
