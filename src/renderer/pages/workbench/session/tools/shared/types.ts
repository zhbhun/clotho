import type { TFunction } from 'i18next'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import type {
  ClaudeImageSource,
  ClaudeToolRequest,
  ClaudeToolResult,
} from '../../../../../services/claude/claude'
import type { ClaudeBackgroundTask } from '../../conversation/types'

export interface ToolRenderer {
  icon: LucideIcon
  label: string
  description: string
  summary: (input: unknown, result?: string, toolUseResult?: unknown, t?: TFunction) => string
  inputView: (input: unknown) => ReactNode
  annotationView?: (input: unknown) => ReactNode
  hasBody?: (
    input: unknown,
    result?: string,
    images?: ClaudeImageSource[],
    toolUseResult?: unknown,
    isError?: boolean,
  ) => boolean
  bodyView?: (
    input: unknown,
    result?: string,
    images?: ClaudeImageSource[],
    toolUseResult?: unknown,
  ) => ReactNode
  bodyItemView?: (context: ToolItemContext) => ReactNode
  footerView?: (
    input: unknown,
    result?: string,
    images?: ClaudeImageSource[],
    toolUseResult?: unknown,
    isError?: boolean,
  ) => ReactNode
  itemView?: (context: ToolItemContext) => ReactNode
  flushBody?: boolean
  floatingFooter?: boolean
  opensSubagent?: boolean
  canOpenSubagent?: (toolUseResult: unknown, isError: boolean) => boolean
}

export interface CoalescedRead {
  file_path: string
  offset?: number
  limit?: number
}

export interface ToolItemContext {
  name?: string
  input?: unknown
  result?: string
  toolUseResult?: unknown
  projectPath?: string
  images?: ClaudeImageSource[]
  coalescedReads?: CoalescedRead[]
  toolUseId?: string
  onOpenSubagent?: (toolUseId: string) => void
  pendingRequest?: ClaudeToolRequest
  onRespond?: (result: ClaudeToolResult) => Promise<void>
  isError?: boolean
  isRunning?: boolean
  backgroundTask?: ClaudeBackgroundTask
}
