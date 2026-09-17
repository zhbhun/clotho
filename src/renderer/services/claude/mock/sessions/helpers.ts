import type { ClaudeContentPart, ClaudeJsonLine } from '@/shared/rpc'

export interface ToolUseOptions {
  id?: string
  parentToolUseId?: string
  ts?: string
  thinking?: string
  uuid?: string
}

export interface ToolResultOptions {
  isError?: boolean
  toolUseResult?: unknown
  ts?: string
  parentToolUseId?: string
  uuid?: string
}

let seq = 0

export function uid(prefix: string): string {
  seq += 1
  return `${prefix}-${seq.toString(36).padStart(4, '0')}`
}

export function callId(prefix = 'call'): string {
  seq += 1
  return `${prefix}_${uid('mock')}${seq.toString(36)}`
}

export function ts(daysAgo = 0, hoursAgo = 0): string {
  const base = new Date('2026-07-11T09:00:00.000Z').getTime()
  const offset = (daysAgo * 24 + hoursAgo) * 60 * 60 * 1000
  return new Date(base - offset).toISOString()
}

export function assistantToolUse(
  name: string,
  input: Record<string, unknown>,
  opts: ToolUseOptions = {},
): ClaudeJsonLine {
  const id = opts.id ?? callId()
  const content: ClaudeContentPart[] = []
  if (opts.thinking) content.push({ type: 'thinking', thinking: opts.thinking })
  content.push({ type: 'tool_use', id, name, input })
  return {
    type: 'assistant',
    uuid: opts.uuid ?? uid('asst'),
    timestamp: opts.ts ?? ts(),
    parent_tool_use_id: opts.parentToolUseId,
    message: { role: 'assistant', content },
  }
}

export function userToolResult(
  toolUseId: string,
  content: string | ClaudeContentPart[],
  opts: ToolResultOptions = {},
): ClaudeJsonLine {
  const parts: ClaudeContentPart[] = Array.isArray(content)
    ? content
    : [{ type: 'tool_result', tool_use_id: toolUseId, content, is_error: opts.isError }]
  if (!Array.isArray(content)) {
    return {
      type: 'user',
      uuid: opts.uuid ?? uid('user'),
      timestamp: opts.ts ?? ts(),
      parent_tool_use_id: opts.parentToolUseId,
      message: { role: 'user', content: parts },
      toolUseResult: opts.toolUseResult,
    }
  }
  return {
    type: 'user',
    uuid: opts.uuid ?? uid('user'),
    timestamp: opts.ts ?? ts(),
    parent_tool_use_id: opts.parentToolUseId,
    message: { role: 'user', content: parts },
    toolUseResult: opts.toolUseResult,
  }
}

export function assistantText(text: string, opts: ToolUseOptions = {}): ClaudeJsonLine {
  return {
    type: 'assistant',
    uuid: opts.uuid ?? uid('asst'),
    timestamp: opts.ts ?? ts(),
    parent_tool_use_id: opts.parentToolUseId,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  }
}

export function userText(
  text: string,
  opts: { parentToolUseId?: string; ts?: string; uuid?: string } = {},
): ClaudeJsonLine {
  return {
    type: 'user',
    uuid: opts.uuid ?? uid('user'),
    timestamp: opts.ts ?? ts(),
    parent_tool_use_id: opts.parentToolUseId,
    message: { role: 'user', content: text },
  }
}

export function toolCallPair(
  name: string,
  input: Record<string, unknown>,
  resultContent: string | ClaudeContentPart[],
  opts: {
    toolUseResult?: unknown
    isError?: boolean
    id?: string
    parentToolUseId?: string
    resultUuid?: string
    ts?: string
    useUuid?: string
  } = {},
): ClaudeJsonLine[] {
  const id = opts.id ?? callId()
  return [
    assistantToolUse(name, input, {
      id,
      parentToolUseId: opts.parentToolUseId,
      ts: opts.ts,
      uuid: opts.useUuid,
    }),
    userToolResult(id, resultContent, {
      isError: opts.isError,
      toolUseResult: opts.toolUseResult,
      parentToolUseId: opts.parentToolUseId,
      ts: opts.ts,
      uuid: opts.resultUuid,
    }),
  ]
}
