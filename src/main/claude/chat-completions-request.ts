/**
 * Anthropic Messages → Chat Completions request translation for the local
 * model proxy. Covers the subset of the Messages API that Claude Code emits:
 * system prompts, text/image/tool_result blocks, tool definitions, sampling
 * parameters, and streaming.
 */
import type { ReasoningWireParams } from '@/shared/reasoning'

import { isPlainObject } from './object'

type AnthropicBlock = Record<string, unknown>

function textBlockText(block: AnthropicBlock): string {
  return typeof block.text === 'string' ? block.text : ''
}

function systemText(system: unknown): string | undefined {
  if (typeof system === 'string') {
    const trimmed = system.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  if (!Array.isArray(system)) return undefined
  const parts = system
    .filter(isPlainObject)
    .map((block) => textBlockText(block))
    .filter((text) => text.length > 0)
  return parts.length > 0 ? parts.join('\n') : undefined
}

function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(isPlainObject)
    .map((block) => textBlockText(block))
    .filter((text) => text.length > 0)
    .join('\n')
}

function imageToChatPart(source: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(source) || source.type !== 'base64') return undefined
  const { media_type: mediaType, data } = source as { media_type?: unknown; data?: unknown }
  if (typeof mediaType !== 'string' || typeof data !== 'string') return undefined
  return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${data}` } }
}

interface AssembledMessage {
  role: 'user' | 'assistant'
  content?: unknown
  toolCalls: Record<string, unknown>[]
  imageParts: Record<string, unknown>[]
}

function pushText(assembled: AssembledMessage, text: string) {
  if (text.length === 0) return
  if (typeof assembled.content !== 'string') assembled.content = ''
  assembled.content = (assembled.content as string) + text
}

function pushImagePart(assembled: AssembledMessage, part: Record<string, unknown>) {
  assembled.imageParts.push(part)
}

function convertToolUse(block: AnthropicBlock): Record<string, unknown> | undefined {
  const { id, name, input } = block as { id?: unknown; name?: unknown; input?: unknown }
  if (typeof id !== 'string' || typeof name !== 'string') return undefined
  return {
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(input ?? {}) },
  }
}

function convertToolResult(block: AnthropicBlock): Record<string, unknown> | undefined {
  const { tool_use_id: toolUseId } = block as { tool_use_id?: unknown }
  if (typeof toolUseId !== 'string') return undefined
  return {
    role: 'tool',
    tool_call_id: toolUseId,
    content: toolResultText(block.content),
  }
}

function anthropicMessageToChat(message: unknown): Record<string, unknown>[] {
  if (!isPlainObject(message)) return []
  const role = message.role === 'assistant' ? 'assistant' : 'user'

  if (typeof message.content === 'string') {
    return [{ role, content: message.content }]
  }
  if (!Array.isArray(message.content)) return []

  const assembled: AssembledMessage = { role, toolCalls: [], imageParts: [] }
  const toolMessages: Record<string, unknown>[] = []

  for (const block of message.content.filter(isPlainObject)) {
    if (role === 'assistant') {
      if (block.type === 'text') {
        pushText(assembled, textBlockText(block))
      } else if (block.type === 'tool_use') {
        const toolCall = convertToolUse(block)
        if (toolCall) assembled.toolCalls.push(toolCall)
      }
      // `thinking` blocks are intentionally not replayed to Chat Completions upstreams.
    } else if (block.type === 'tool_result') {
      const toolMessage = convertToolResult(block)
      if (toolMessage) toolMessages.push(toolMessage)
    } else if (block.type === 'text') {
      pushText(assembled, textBlockText(block))
    } else if (block.type === 'image') {
      const part = imageToChatPart(block.source)
      if (part) pushImagePart(assembled, part)
    }
  }

  const output: Record<string, unknown>[] = [...toolMessages]
  const text = typeof assembled.content === 'string' ? assembled.content : ''
  if (assembled.toolCalls.length > 0) {
    output.push({
      role,
      content: text.length > 0 ? text : null,
      tool_calls: assembled.toolCalls,
    })
    return output
  }
  if (assembled.imageParts.length > 0) {
    const parts: Record<string, unknown>[] = []
    if (text.length > 0) parts.push({ type: 'text', text })
    parts.push(...assembled.imageParts)
    output.push({ role, content: parts })
    return output
  }
  if (text.length > 0) {
    output.push({ role, content: text })
  }
  return output
}

function anthropicToolToChat(tool: unknown): Record<string, unknown> | undefined {
  if (!isPlainObject(tool)) return undefined
  const {
    name,
    description,
    input_schema: inputSchema,
  } = tool as {
    name?: unknown
    description?: unknown
    input_schema?: unknown
  }
  if (typeof name !== 'string') return undefined
  const fn: Record<string, unknown> = {
    name,
    parameters: isPlainObject(inputSchema) ? inputSchema : { type: 'object', properties: {} },
  }
  if (typeof description === 'string') fn.description = description
  return { type: 'function', function: fn }
}

function toolChoiceToChat(choice: unknown): unknown {
  if (!isPlainObject(choice)) return undefined
  if (choice.type === 'auto') return 'auto'
  if (choice.type === 'none') return 'none'
  if (choice.type === 'any') return 'required'
  if (choice.type === 'tool' && typeof choice.name === 'string') {
    return { type: 'function', function: { name: choice.name } }
  }
  return undefined
}

/** Convert an Anthropic /v1/messages body into a Chat Completions body. */
export function anthropicToChatCompletions(
  body: Record<string, unknown>,
  thinking?: ReasoningWireParams,
): Record<string, unknown> {
  const messages: Record<string, unknown>[] = []
  const system = systemText(body.system)
  if (system) messages.push({ role: 'system', content: system })
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    messages.push(...anthropicMessageToChat(message))
  }

  const chat: Record<string, unknown> = { model: body.model, messages }
  if (typeof body.max_tokens === 'number') chat.max_tokens = body.max_tokens
  if (typeof body.temperature === 'number') chat.temperature = body.temperature
  if (typeof body.top_p === 'number') chat.top_p = body.top_p
  if (Array.isArray(body.stop_sequences) && body.stop_sequences.length > 0) {
    chat.stop = body.stop_sequences
  }
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    const tools = body.tools.map(anthropicToolToChat).filter((tool) => Boolean(tool))
    if (tools.length > 0) chat.tools = tools
  }
  const toolChoice = toolChoiceToChat(body.tool_choice)
  if (toolChoice !== undefined) chat.tool_choice = toolChoice
  if (body.stream === true) {
    chat.stream = true
    chat.stream_options = { include_usage: true }
  }
  if (thinking) Object.assign(chat, thinking)
  return chat
}

/**
 * Rough token estimate for /v1/messages/count_tokens, which Chat Completions
 * upstreams do not offer. One token per four characters is the usual heuristic.
 */
export function estimatePromptTokens(body: Record<string, unknown>): number {
  const chars = JSON.stringify({
    system: body.system,
    messages: body.messages,
    tools: body.tools,
  }).length
  return Math.max(1, Math.ceil(chars / 4))
}
