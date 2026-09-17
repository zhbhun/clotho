import type { ClaudeSubagent } from '../../../services/claude/claude'
import type { ClaudeMessage } from './services/message'

export type SessionSubagentStatus = 'running' | 'completed' | 'failed' | 'stopped' | 'unknown'

export interface SessionSubagent extends ClaudeSubagent {
  status: SessionSubagentStatus
  parentToolUseId?: string
  prompt?: string
}

export interface SessionWorkflow {
  runId: string
  name: string
  toolUseId: string
  createdAt: string
  agents: SessionSubagent[]
}

type AgentCall = {
  agentId?: string
  agentType: string
  createdAt: string
  description: string
  parentToolUseId?: string
  prompt: string
  status: SessionSubagentStatus
  toolUseId: string
}

const AGENT_TOOL_NAMES = new Set(['Agent', 'AgentTool', 'Task'])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function stringField(value: unknown, keys: string[]): string {
  const source = record(value)
  for (const key of keys) {
    const field = source[key]
    if (typeof field === 'string' && field.trim()) return field
  }
  return ''
}

function resultStatus(result: {
  isError?: boolean
  toolUseResult?: unknown
}): SessionSubagentStatus {
  if (result.isError) return 'failed'
  const status = stringField(result.toolUseResult, ['status']).toLowerCase()
  if (
    status === 'running' ||
    status === 'in_progress' ||
    status === 'async_launched' ||
    status === 'remote_launched'
  ) {
    return 'running'
  }
  if (status === 'failed' || status === 'error') return 'failed'
  if (status === 'stopped' || status === 'cancelled' || status === 'aborted') return 'stopped'
  return 'completed'
}

function collectAgentCalls(messages: ClaudeMessage[]): AgentCall[] {
  const calls = new Map<string, AgentCall>()

  for (const message of messages) {
    for (const block of message.blocks ?? []) {
      if (block.type === 'tool_use' && AGENT_TOOL_NAMES.has(block.name ?? '') && block.toolUseId) {
        const call: AgentCall = {
          agentType: stringField(block.input, ['subagent_type', 'agent_type']),
          createdAt: message.timestamp ?? '',
          description: stringField(block.input, ['description', 'prompt']),
          prompt: stringField(block.input, ['prompt']),
          status: 'running',
          toolUseId: block.toolUseId,
        }
        if (message.parentToolUseId) call.parentToolUseId = message.parentToolUseId
        calls.set(block.toolUseId, call)
        continue
      }

      if (block.type !== 'tool_result' || !block.toolUseId) continue
      const call = calls.get(block.toolUseId)
      if (!call) continue
      call.status = resultStatus(block)
      const agentId = stringField(block.toolUseResult, ['agentId', 'agent_id'])
      if (agentId) call.agentId = agentId
    }

    const notification = message.taskNotification
    if (notification?.toolUseId) {
      const call = calls.get(notification.toolUseId)
      if (call) call.status = notification.status
    }
  }

  return Array.from(calls.values())
}

export function buildSessionSubagents(
  index: ClaudeSubagent[],
  messages: ClaudeMessage[],
): SessionSubagent[] {
  const calls = collectAgentCalls(messages)
  const callsByToolUseId = new Map(calls.map((call) => [call.toolUseId, call]))
  const indexedToolUseIds = new Set(index.map((subagent) => subagent.toolUseId))
  const indexed = index.map((subagent) => {
    const call = callsByToolUseId.get(subagent.toolUseId)
    const merged: SessionSubagent = {
      ...subagent,
      agentType: call?.agentType || subagent.agentType,
      createdAt: call?.createdAt || subagent.createdAt,
      description: call?.description || subagent.description,
      status: call?.status ?? 'unknown',
    }
    if (call?.parentToolUseId) merged.parentToolUseId = call.parentToolUseId
    if (call?.prompt) merged.prompt = call.prompt
    return merged
  })

  const discovered = calls.flatMap((call) => {
    if (indexedToolUseIds.has(call.toolUseId)) return []
    if (call.status === 'failed' && !call.agentId) return []
    const subagent: SessionSubagent = {
      id: call.agentId || call.toolUseId,
      agentType: call.agentType,
      description: call.description,
      toolUseId: call.toolUseId,
      spawnDepth: call.parentToolUseId ? 2 : 1,
      createdAt: call.createdAt,
      status: call.status,
    }
    if (call.parentToolUseId) subagent.parentToolUseId = call.parentToolUseId
    if (call.prompt) subagent.prompt = call.prompt
    return [subagent]
  })

  return [...indexed, ...discovered]
}

function newestFirst(left: SessionSubagent, right: SessionSubagent): number {
  const time = Date.parse(right.createdAt) - Date.parse(left.createdAt)
  return time || right.id.localeCompare(left.id)
}

export function sortSessionItems<T extends { createdAt: string }>(items: T[]): T[] {
  return items.toSorted((left, right) => {
    const leftTime = Date.parse(left.createdAt)
    const rightTime = Date.parse(right.createdAt)
    const hasLeftTime = Number.isFinite(leftTime)
    const hasRightTime = Number.isFinite(rightTime)

    if (!hasLeftTime) return hasRightTime ? 1 : 0
    if (!hasRightTime) return -1
    return leftTime - rightTime
  })
}

export function directRunningSubagents(
  currentMessages: ClaudeMessage[],
  subagents: SessionSubagent[],
): SessionSubagent[] {
  const byToolUseId = new Map(subagents.map((subagent) => [subagent.toolUseId, subagent]))
  return collectAgentCalls(currentMessages)
    .filter((call) => call.status === 'running')
    .flatMap((call) => {
      const subagent = byToolUseId.get(call.toolUseId)
      return subagent ? [subagent] : []
    })
    .toSorted(newestFirst)
}

export function mergeSubagentMessages(
  history: ClaudeMessage[],
  live: ClaudeMessage[],
): ClaudeMessage[] {
  const merged = new Map<string, ClaudeMessage>()
  for (const message of [...history, ...live]) {
    merged.set(message.uuid || message.id, message)
  }
  return Array.from(merged.values())
}

export function isNaturalSubagentUserMessage(message: ClaudeMessage): boolean {
  if (message.role !== 'user' || message.isMeta) return false
  const blocks = message.blocks ?? []
  if (blocks.some((block) => block.type === 'text' && block.text?.trim())) return true
  return blocks.length === 0 && Boolean(message.content.trim())
}

export function prependSubagentPrompt(
  subagent: SessionSubagent,
  messages: ClaudeMessage[],
): ClaudeMessage[] {
  if (!subagent.prompt?.trim() || messages.some(isNaturalSubagentUserMessage)) return messages

  const id = `subagent-prompt-${subagent.toolUseId}`
  return [
    {
      id,
      uuid: id,
      role: 'user',
      content: subagent.prompt,
      blocks: [{ type: 'text', text: subagent.prompt }],
      timestamp: subagent.createdAt,
      parentToolUseId: subagent.toolUseId,
    },
    ...messages,
  ]
}
