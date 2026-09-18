import type { ClaudeToolRequest } from '../../../../services/claude/claude'
import { type TurnTerminalStatus, isTimelineToolRunning } from './tool-state'
import type { ConversationTimelineItem } from './types'

/** Category counts behind a collapsed work-run summary line. */
export interface WorkRunCounts {
  agents: number
  commands: number
  filesEdited: number
  filesRead: number
  other: number
  searches: number
  tasks: number
  web: number
}

/** A timeline slice: either a collapsible run of consecutive work items or a standalone item. */
export type WorkRunSlice =
  | { items: ConversationTimelineItem[]; kind: 'run'; runId: string }
  | { item: ConversationTimelineItem; kind: 'single' }

/**
 * Collapsed header state of a run: the tool currently executing while streaming,
 * a thinking placeholder between tools, or the finished category summary.
 */
export type WorkRunHeader =
  | { kind: 'running'; tool: Extract<ConversationTimelineItem, { kind: 'tool' }> }
  | { kind: 'summary' }
  | { kind: 'thinking' }

const COMMAND_TOOL_NAMES = new Set([
  'Bash',
  'BashTool',
  'Monitor',
  'MonitorTool',
  'PowerShell',
  'PowerShellTool',
])
const READ_TOOL_NAMES = new Set(['Read', 'FileReadTool', 'ReadCoalesced'])
const EDIT_TOOL_NAMES = new Set(['Edit', 'FileEditTool', 'Write', 'FileWriteTool'])
const SEARCH_TOOL_NAMES = new Set(['Glob', 'GlobTool', 'Grep', 'GrepTool'])
const WEB_TOOL_NAMES = new Set(['WebFetch', 'WebFetchTool', 'WebSearch', 'WebSearchTool'])
const AGENT_TOOL_NAMES = new Set(['Agent', 'AgentTool', 'Task'])

/**
 * Group consecutive non-text items into collapsible runs; a lone item stays standalone.
 * Items with a pending request (permission prompt) are never grouped so their
 * controls stay directly reachable, and they break the surrounding run.
 */
export function groupWorkRuns(
  items: ConversationTimelineItem[],
  keyPrefix: string,
  isGroupable: (item: ConversationTimelineItem) => boolean = () => true,
): WorkRunSlice[] {
  const slices: WorkRunSlice[] = []
  let group: ConversationTimelineItem[] = []

  const flush = () => {
    if (group.length >= 2) {
      slices.push({ kind: 'run', runId: `${keyPrefix}:run:${group[0].id}`, items: group })
    } else {
      for (const item of group) slices.push({ kind: 'single', item })
    }
    group = []
  }

  for (const item of items) {
    if (item.kind === 'text' || !isGroupable(item)) {
      flush()
      slices.push({ kind: 'single', item })
      continue
    }
    group.push(item)
  }
  flush()

  return slices
}

export function summarizeWorkRun(items: ConversationTimelineItem[]): {
  counts: WorkRunCounts
  thoughtCount: number
} {
  const counts: WorkRunCounts = {
    agents: 0,
    commands: 0,
    filesEdited: 0,
    filesRead: 0,
    other: 0,
    searches: 0,
    tasks: 0,
    web: 0,
  }
  let thoughtCount = 0

  for (const item of items) {
    if (item.kind === 'thinking') {
      thoughtCount += 1
      continue
    }
    if (item.kind === 'todo' || item.kind === 'task') {
      counts.tasks += 1
      continue
    }
    if (item.kind !== 'tool') continue

    const name = item.use?.name ?? ''
    if (READ_TOOL_NAMES.has(name)) {
      counts.filesRead += item.coalescedReads?.length || 1
    } else if (EDIT_TOOL_NAMES.has(name)) {
      counts.filesEdited += 1
    } else if (COMMAND_TOOL_NAMES.has(name)) {
      counts.commands += 1
    } else if (SEARCH_TOOL_NAMES.has(name)) {
      counts.searches += 1
    } else if (WEB_TOOL_NAMES.has(name)) {
      counts.web += 1
    } else if (AGENT_TOOL_NAMES.has(name)) {
      counts.agents += 1
    } else {
      counts.other += 1
    }
  }

  return { counts, thoughtCount }
}

export function workRunHeader(
  items: ConversationTimelineItem[],
  options: {
    isActive: boolean
    isStreaming: boolean
    pendingRequests?: Record<string, ClaudeToolRequest>
    turnTerminalStatus?: TurnTerminalStatus
  },
): WorkRunHeader {
  if (options.isActive) {
    const lastItem = items.at(-1)
    if (lastItem?.kind === 'tool') {
      const pendingRequest = lastItem.use?.toolUseId
        ? options.pendingRequests?.[lastItem.use.toolUseId]
        : undefined
      const isRunning = isTimelineToolRunning(lastItem, {
        isStreaming: options.isStreaming,
        pendingRequest,
        turnTerminalStatus: options.turnTerminalStatus,
      })
      if (isRunning) return { kind: 'running', tool: lastItem }
    }
    if (options.isStreaming && !options.turnTerminalStatus) return { kind: 'thinking' }
  }
  return { kind: 'summary' }
}
