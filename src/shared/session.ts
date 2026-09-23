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
  /**
   * Stable conversation id; mirrors the stored file name. Files written before
   * the field existed omit it, and readers fall back to the file name.
   */
  id?: string
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

/**
 * One record per known session in sessions/index.json. A conversation starts
 * as a draft (isDraft plus title and timestamps) and keeps a stripped record
 * after it starts, so the index also carries the session → project-entry
 * ownership used to split folder / workspace histories of one directory.
 */
export interface SessionIndexEntry {
  projectId: string | null
  projectPath?: string | null
  claudeSessionId?: string | null
  isDraft?: boolean
  title?: string
  createdAt?: number
  updatedAt?: number
}

export type SessionIndex = Record<string, SessionIndexEntry>
