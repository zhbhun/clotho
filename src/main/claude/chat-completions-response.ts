/**
 * Chat Completions → Anthropic Messages response translation for the local
 * model proxy: non-streaming completions, upstream error payloads, and the
 * stop-reason mapping shared with the streaming translator.
 */

type ChatMessage = Record<string, unknown>

const STOP_REASON_BY_FINISH: Record<string, string> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'refusal',
}

const ERROR_TYPE_BY_STATUS: Array<[minStatus: number, maxStatus: number, type: string]> = [
  [400, 400, 'invalid_request_error'],
  [401, 403, 'authentication_error'],
  [404, 404, 'not_found_error'],
  [429, 429, 'rate_limit_error'],
]

/** Map a Chat Completions finish reason to an Anthropic stop reason. */
export function mapStopReason(finishReason: unknown, hasToolUse: boolean): string {
  if (typeof finishReason === 'string') {
    const mapped = STOP_REASON_BY_FINISH[finishReason]
    if (mapped) return mapped
  }
  return hasToolUse ? 'tool_use' : 'end_turn'
}

function messageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (part): part is ChatMessage =>
        Boolean(part) && typeof part === 'object' && (part as ChatMessage).type === 'text',
    )
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
}

function reasoningText(message: ChatMessage): string {
  for (const key of ['reasoning_content', 'reasoning']) {
    const value = message[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.trim().length === 0) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

function toolUseBlocks(message: ChatMessage): Record<string, unknown>[] {
  if (!Array.isArray(message.tool_calls)) return []
  return message.tool_calls
    .filter(
      (call): call is ChatMessage =>
        Boolean(call) && typeof call === 'object' && isPlainFunctionCall(call as ChatMessage),
    )
    .map((call, index) => {
      const fn = call.function as ChatMessage
      return {
        type: 'tool_use',
        id: typeof call.id === 'string' && call.id.length > 0 ? call.id : `toolu_${index}`,
        name: typeof fn.name === 'string' ? fn.name : '',
        input: parseToolArguments(fn.arguments),
      }
    })
}

function isPlainFunctionCall(call: ChatMessage): boolean {
  const fn = call.function
  return Boolean(fn) && typeof fn === 'object' && !Array.isArray(fn)
}

/** Convert a Chat Completions response into an Anthropic Messages response. */
export function chatCompletionsToAnthropic(chat: unknown, model: string): Record<string, unknown> {
  const chat_ = (chat ?? {}) as ChatMessage
  const choice = Array.isArray(chat_.choices) ? ((chat_.choices[0] ?? {}) as ChatMessage) : {}
  const message = (choice.message ?? {}) as ChatMessage

  const content: Record<string, unknown>[] = []
  const reasoning = reasoningText(message)
  if (reasoning) content.push({ type: 'thinking', thinking: reasoning })
  const text = messageText(message.content)
  if (text.length > 0) content.push({ type: 'text', text })
  const toolUse = toolUseBlocks(message)
  content.push(...toolUse)
  if (content.length === 0) content.push({ type: 'text', text: '' })

  const usage = (chat_.usage ?? {}) as ChatMessage
  return {
    id: typeof chat_.id === 'string' ? chat_.id : '',
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: mapStopReason(choice.finish_reason, toolUse.length > 0),
    stop_sequence: null,
    usage: {
      input_tokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0,
      output_tokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0,
    },
  }
}

export interface AnthropicErrorBody {
  type: 'error'
  error: { type: string; message: string }
}

/** Convert any upstream failure into an Anthropic error payload. */
export function chatErrorToAnthropic(
  status: number,
  payload: unknown,
): { status: number; body: AnthropicErrorBody } {
  let message = 'Upstream request failed'
  if (typeof payload === 'string' && payload.trim().length > 0) {
    message = payload
  } else {
    const error = (payload as ChatMessage | null | undefined)?.error
    if (error && typeof error === 'object') {
      const inner = error as ChatMessage
      if (typeof inner.message === 'string' && inner.message.length > 0) message = inner.message
    }
  }

  let type = 'api_error'
  for (const [min, max, errorType] of ERROR_TYPE_BY_STATUS) {
    if (status >= min && status <= max) {
      type = errorType
      break
    }
  }

  return { status, body: { type: 'error', error: { type, message } } }
}
