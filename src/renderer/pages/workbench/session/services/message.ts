import type {
  ClaudeAttachment,
  ClaudeContentPart,
  ClaudeImageSource,
  ClaudeJsonLine as RpcClaudeJsonLine,
} from '@/shared/rpc'

import { attachmentFromPart } from './attachments'

export type ClaudeJsonLine = RpcClaudeJsonLine

export type ClaudeRole = 'assistant' | 'user' | 'system' | 'tool'

const INTERRUPTION_MARKERS = new Set([
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
])

export interface ClaudeContentBlock {
  type: string
  attachment?: ClaudeAttachment
  text?: string
  name?: string
  input?: unknown
  content?: string
  toolUseId?: string
  toolUseResult?: unknown
  images?: ClaudeImageSource[]
  isError?: boolean
  parentToolUseId?: string
}

export interface ClaudeMessage {
  id: string
  uuid?: string
  /** Parent JSONL entry UUID, used to keep late events attached to their causal turn. */
  parentUuid?: string
  role: ClaudeRole
  content: string
  attachments?: ClaudeAttachment[]
  blocks?: ClaudeContentBlock[]
  type?: string
  isMeta?: boolean
  timestamp?: string
  rawType?: string
  isCommand?: boolean
  commandName?: string
  commandArgs?: string
  /** For subagent output, points to the tool_use ID of the originating Task/Agent; empty for main-agent messages. */
  parentToolUseId?: string
  /** CLI interruption marker: do not render as conversation content; mark the turn stopped. */
  isInterruption?: boolean
  /** Claude persisted an assistant error frame; render it as the turn failure instead of a reply. */
  queryError?: string
  taskNotification?: {
    toolUseId?: string
    taskId?: string
    status: 'completed' | 'failed' | 'stopped'
    result?: string
    summary?: string
  }
}

/** A user-authored prompt, excluding CLI markers and SDK user-role tool carriers. */
export function isUserPromptMessage(message: ClaudeMessage): boolean {
  return (
    message.role === 'user' &&
    !message.isInterruption &&
    !message.blocks?.some((block) => block.type === 'tool_result')
  )
}

function compactPath(path: string) {
  return path.replace(/^\/Users\/[^/]+/, '~')
}

export function parseClaudeLine(line: string, index = 0): ClaudeMessage | null {
  try {
    return claudeJsonToMessage(JSON.parse(line) as ClaudeJsonLine, index)
  } catch {
    return {
      id: `stderr-${Date.now()}-${index}`,
      role: 'system',
      content: line,
      rawType: 'stderr',
    }
  }
}

export function claudeJsonToMessage(entry: ClaudeJsonLine, index = 0): ClaudeMessage | null {
  if (shouldSkipEntry(entry)) return null

  const { role, blocks } = parseEntry(entry)
  const taskNotification = parseTaskNotification(entry)

  if (!blocks.length) return null

  const content = buildContentFromBlocks(blocks)
  const commandInfo = parseCommandMessage(content)
  const displayContent = commandInfo ? commandInfo.display : content
  const displayBlocks = commandInfo
    ? [{ type: 'text' as const, text: commandInfo.display }]
    : blocks

  return {
    id: `${entry.type ?? role}-${entry.timestamp ?? index}-${index}`,
    uuid: typeof entry.uuid === 'string' ? entry.uuid : undefined,
    parentUuid: typeof entry.parentUuid === 'string' ? entry.parentUuid : undefined,
    role,
    content: displayContent,
    blocks: displayBlocks,
    attachments: blocks.some((block) => block.attachment)
      ? blocks.flatMap((block) => (block.attachment ? [block.attachment] : []))
      : undefined,
    type: entry.type,
    isMeta: entry.isMeta,
    isInterruption: isInterruptionMessage(role, blocks),
    timestamp: entry.timestamp,
    rawType: entry.subtype ?? entry.type,
    isCommand: commandInfo?.isCommand,
    commandName: commandInfo?.commandName,
    commandArgs: commandInfo?.commandArgs,
    queryError:
      entry.type === 'assistant' && typeof entry.error === 'string' && entry.error.trim()
        ? displayContent
        : undefined,
    parentToolUseId:
      typeof entry.parent_tool_use_id === 'string' ? entry.parent_tool_use_id : undefined,
    taskNotification,
  }
}

/**
 * Claude writes this synthetic assistant frame while finalizing a cancelled
 * request. It is bookkeeping, not an assistant turn, so it must stay out of
 * both the live stream and the reloaded transcript.
 */
export function isSyntheticNoResponseEntry(entry: ClaudeJsonLine): boolean {
  if (entry.type !== 'assistant') return false
  const message = entry.message
  if (!message || (message as { model?: unknown }).model !== '<synthetic>') return false
  if (typeof message.content === 'string')
    return message.content.trim() === 'No response requested.'
  if (!Array.isArray(message.content) || message.content.length !== 1) return false
  const [block] = message.content
  return block?.type === 'text' && block.text?.trim() === 'No response requested.'
}

function shouldSkipEntry(entry: ClaudeJsonLine): boolean {
  const t = entry.type
  return (
    !t ||
    isSyntheticNoResponseEntry(entry) ||
    t === 'attachment' ||
    t === 'file-history-snapshot' ||
    t === 'last-prompt' ||
    t === 'queue-operation' ||
    t === 'ai-title'
  )
}

/** Match the backend session-follower rule: the body is exactly a known CLI interruption placeholder. */
function isInterruptionMessage(role: ClaudeRole, blocks: ClaudeContentBlock[]): boolean {
  return (
    role === 'user' &&
    blocks.length === 1 &&
    blocks[0].type === 'text' &&
    INTERRUPTION_MARKERS.has(blocks[0].text ?? '')
  )
}

function parseEntry(entry: ClaudeJsonLine): { role: ClaudeRole; blocks: ClaudeContentBlock[] } {
  if (
    entry.type === 'system' &&
    (entry.subtype === 'local_command_output' || entry.subtype === 'local_command')
  ) {
    const content = typeof entry.content === 'string' ? unwrapLocalCommandOutput(entry.content) : ''
    return {
      role: 'assistant',
      blocks: content ? [{ type: 'text', text: content }] : [],
    }
  }

  if (entry.result) {
    return { role: 'system', blocks: [{ type: 'text', text: entry.result }] }
  }

  if (entry.type === 'system' && entry.subtype === 'init') {
    const model = entry.model ? ` · ${entry.model}` : ''
    const cwd = entry.cwd ? ` · ${compactPath(entry.cwd)}` : ''
    return {
      role: 'system',
      blocks: [{ type: 'text', text: `Claude session initialized${model}${cwd}` }],
    }
  }

  if (entry.type === 'system' && entry.subtype === 'task_notification') {
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    return {
      role: summary ? 'assistant' : 'system',
      blocks: summary ? [{ type: 'text', text: summary }] : [],
    }
  }

  const rawContent = entry.message?.content
  const toolUseResult = entry.toolUseResult ?? entry.tool_use_result

  if (typeof rawContent === 'string') {
    if (isTaskNotificationEntry(entry) || isTaskNotificationContent(rawContent)) {
      const summary = taskNotificationSummary(rawContent)
      return {
        role: summary ? 'assistant' : 'system',
        blocks: summary ? [{ type: 'text', text: summary }] : [],
      }
    }

    const trimmed = cleanContent(rawContent)
    if (!trimmed) return { role: inferRole(entry), blocks: [] }
    return { role: inferRole(entry), blocks: [{ type: 'text', text: trimmed }] }
  }

  if (!Array.isArray(rawContent)) {
    return { role: inferRole(entry), blocks: [] }
  }

  const blocks: ClaudeContentBlock[] = rawContent
    .map((part) => {
      const attachment = entry.type === 'user' ? attachmentFromPart(part) : undefined
      if (attachment) return { type: 'attachment', attachment }
      if (part.type === 'tool_use') {
        return {
          type: 'tool_use',
          name: part.name,
          input: part.input,
          toolUseId: part.id,
        }
      }

      if (part.type === 'tool_result') {
        if (Array.isArray(part.content)) {
          const images = part.content
            .filter((c) => c.type === 'image' && c.source?.data)
            .map((c) => c.source as ClaudeImageSource)
          const text = part.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text ?? '')
            .join('\n')
          return {
            type: 'tool_result',
            content: text,
            toolUseId: part.tool_use_id,
            toolUseResult,
            images: images.length ? images : undefined,
            isError: Boolean(part.is_error),
          }
        }
        const resultText = typeof part.content === 'string' ? part.content : ''
        return {
          type: 'tool_result',
          content: resultText,
          toolUseId: part.tool_use_id,
          toolUseResult,
          isError: Boolean(part.is_error),
        }
      }

      if (part.type === 'thinking') {
        return { type: 'thinking', text: part.thinking ?? part.text ?? '' }
      }

      return { type: 'text', text: part.text ?? textFromNestedContent(part.content) }
    })
    .filter((block) => {
      if (block.type === 'text' && !block.text?.trim()) return false
      if (block.type === 'thinking' && !block.text?.trim()) return false
      return true
    })

  const hasToolResult = blocks.some((b) => b.type === 'tool_result')
  const hasUserText = blocks.some(
    (b) => b.type === 'attachment' || (b.type === 'text' && !isSystemText(b.text)),
  )

  if (entry.type === 'user' && hasToolResult && !hasUserText) {
    return { role: 'tool', blocks }
  }

  const filteredBlocks = blocks.filter((b) => b.type !== 'text' || !isSystemText(b.text))
  if (entry.type === 'user' && !hasUserText && !hasToolResult) {
    return { role: 'system', blocks: filteredBlocks }
  }

  return { role: inferRole(entry), blocks: filteredBlocks }
}

function isTaskNotificationEntry(entry: ClaudeJsonLine): boolean {
  const origin = entry.origin
  return (
    entry.type === 'user' &&
    Boolean(origin) &&
    typeof origin === 'object' &&
    (origin as Record<string, unknown>).kind === 'task-notification'
  )
}

function isTaskNotificationContent(content: string): boolean {
  const trimmed = content.trim()
  return trimmed.startsWith('<task-notification>') && trimmed.endsWith('</task-notification>')
}

function taskNotificationSummary(content: string): string {
  return xmlTextField(content, 'summary')
}

function taskNotificationStatus(value: unknown): 'completed' | 'failed' | 'stopped' | undefined {
  return value === 'completed' || value === 'failed' || value === 'stopped' ? value : undefined
}

function parseTaskNotification(entry: ClaudeJsonLine): ClaudeMessage['taskNotification'] {
  if (entry.type === 'system' && entry.subtype === 'task_notification') {
    const toolUseId = typeof entry.tool_use_id === 'string' ? entry.tool_use_id : ''
    const taskId = typeof entry.task_id === 'string' ? entry.task_id : ''
    const status = taskNotificationStatus(entry.status)
    if ((!toolUseId && !taskId) || !status) return undefined
    const result = typeof entry.result === 'string' ? entry.result : ''
    const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
    return {
      toolUseId: toolUseId || undefined,
      taskId: taskId || undefined,
      status,
      result: result.trim() ? result : undefined,
      summary: summary || undefined,
    }
  }

  const content = entry.message?.content
  if (
    typeof content !== 'string' ||
    (!isTaskNotificationEntry(entry) && !isTaskNotificationContent(content))
  ) {
    return undefined
  }
  const toolUseId = xmlTextField(content, 'tool-use-id')
  const taskId = xmlTextField(content, 'task-id')
  const status = taskNotificationStatus(xmlTextField(content, 'status'))
  if ((!toolUseId && !taskId) || !status) return undefined
  const result =
    (typeof entry.result === 'string' && entry.result.trim() ? entry.result : '') ||
    xmlTextField(content, 'result')
  const summary = xmlTextField(content, 'summary')
  return {
    toolUseId: toolUseId || undefined,
    taskId: taskId || undefined,
    status,
    result: result || undefined,
    summary: summary || undefined,
  }
}

export function xmlTextField(content: string, tag: string): string {
  const match = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return decodeXmlText(match?.[1]?.trim() ?? '')
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function isSystemText(text?: string): boolean {
  if (!text) return true
  const t = text.trim()
  return t.startsWith('<ide_opened_file>') || t.startsWith('Base directory for this skill')
}

function inferRole(entry: ClaudeJsonLine): ClaudeRole {
  if (entry.type === 'assistant') {
    return 'assistant'
  }

  if (entry.type === 'user') {
    return 'user'
  }

  return 'system'
}

function buildContentFromBlocks(blocks: ClaudeContentBlock[]): string {
  return cleanContent(
    blocks
      .map((block) => {
        if (block.type === 'tool_use') return `Used tool: ${block.name ?? 'tool'}`
        if (block.type === 'tool_result') return block.content ?? ''
        return block.text ?? ''
      })
      .filter(Boolean)
      .join('\n\n'),
  )
}

function textFromNestedContent(content: ClaudeContentPart['content']) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content.map((part) => part.text ?? '').join('\n')
  }

  return ''
}

function cleanContent(content: string) {
  const trimmed = content.trim()

  if (
    trimmed.startsWith('<command-name>') ||
    trimmed.startsWith('<local-command-stdout>') ||
    trimmed.includes(
      'Caveat: The messages below were generated by the user while running local commands',
    )
  ) {
    return trimmed
  }

  return trimmed
}

function unwrapLocalCommandOutput(content: string) {
  const trimmed = content.trim()
  const wrapper = trimmed.match(
    /^<local-command-(?:stdout|stderr)>([\s\S]*)<\/local-command-(?:stdout|stderr)>$/,
  )
  return (wrapper?.[1] ?? trimmed).trim()
}

interface CommandInfo {
  isCommand: boolean
  commandName: string
  commandArgs: string
  display: string
}

function parseCommandMessage(content: string): CommandInfo | null {
  if (!content.includes('<command-message>') && !content.includes('<command-name>')) {
    return null
  }

  const cmdNameMatch = content.match(/<command-name>([^<]*)<\/command-name>/)
  const cmdArgsMatch = content.match(/<command-args>([^<]*)<\/command-args>/)

  if (!cmdNameMatch) return null

  const commandName = cmdNameMatch[1].trim().replace(/^\/+/, '')
  const commandArgs = cmdArgsMatch ? cmdArgsMatch[1].trim() : ''
  const display = commandArgs ? `/${commandName} ${commandArgs}` : `/${commandName}`

  return { isCommand: true, commandName, commandArgs, display }
}
