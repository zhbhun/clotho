import type { TodoItem } from '../../../../services/claude/todo'
import type { ClaudeContentBlock, ClaudeMessage } from '../services/message'

export type ClaudeBackgroundTaskStatus = 'running' | 'completed' | 'failed' | 'stopped'

export interface ClaudeBackgroundTask {
  taskId: string
  status: ClaudeBackgroundTaskStatus
  output?: string
  summary?: string
  exitCode?: number
}

export type ClaudeTaskStatus = 'pending' | 'in_progress' | 'completed'

export interface ClaudeTaskItem {
  id: string
  subject: string
  description?: string
  activeForm?: string
  status: ClaudeTaskStatus
}

export interface ConversationTurn {
  userMessage: ClaudeMessage
  assistantMessages: ClaudeMessage[]
  workBlocks: ClaudeContentBlock[]
  textBlocks: ClaudeContentBlock[]
  timelineItems: ConversationTimelineItem[]
  timestamp?: string
  startTimestamp?: string
  endTimestamp?: string
  /** The turn was interrupted by the user (the JSONL marker is folded into turn state). */
  isInterrupted?: boolean
  /** Claude persisted a terminal assistant error for this turn. */
  failure?: { message: string }
}

export type ConversationTimelineItem =
  | {
      id: string
      kind: 'text'
      text: string
      timestamp?: string
    }
  | {
      id: string
      kind: 'thinking'
      text: string
      timestamp?: string
    }
  | {
      id: string
      kind: 'todo'
      todos: TodoItem[]
      toolUseId?: string
      resultText?: string
      timestamp?: string
    }
  | {
      id: string
      kind: 'task'
      tasks: ClaudeTaskItem[]
      timestamp?: string
    }
  | {
      id: string
      kind: 'tool'
      use?: ClaudeContentBlock
      result?: ClaudeContentBlock
      isError?: boolean
      timestamp?: string
      /** Lifecycle of a Bash, PowerShell, or Monitor task that continues after launch. */
      backgroundTask?: ClaudeBackgroundTask
      /** Subagent timeline, rendered in the dialog when the Agent card is clicked. */
      children?: ConversationTimelineItem[]
      /** Coalesced Read: a list of files from consecutive Read calls (a single Read has length 1). */
      coalescedReads?: { file_path: string; offset?: number; limit?: number }[]
    }
