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
  /** When the session was pinned (seconds); presence marks it pinned. */
  pinnedAt?: number
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
  /** Archive mark; may live on a marker entry that has no stored session file. */
  archived?: boolean
  /** When the session was archived (seconds). */
  archivedAt?: number
  /** When the user last unarchived the session (seconds); grants one auto-archive grace period. */
  unarchivedAt?: number
  /** When the session was pinned (seconds); presence marks it pinned. */
  pinnedAt?: number
  /** Unread activity kind recorded when a run finished while the session was not active. */
  unread?: 'success' | 'error'
  /** When the unread mark was recorded (seconds). */
  unreadAt?: number
}

export type SessionIndex = Record<string, SessionIndexEntry>

/**
 * List state of one claude session (archive, pin, unread), gathered from the
 * index by claudeSessionId and merged into listed sessions.
 */
export interface SessionListFlags {
  archived: boolean
  archivedAt?: number
  unarchivedAt?: number
  pinnedAt?: number
  unread?: 'success' | 'error'
  unreadAt?: number
}
