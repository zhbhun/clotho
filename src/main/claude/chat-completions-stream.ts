/**
 * Chat Completions → Anthropic Messages streaming translation for the local
 * model proxy. A stateful SSE transformer: upstream `chat.completion.chunk`
 * frames in, Anthropic content-block events out. Reasoning deltas open a
 * `thinking` block, text deltas a `text` block, and tool-call arguments are
 * buffered per tool and flushed as sequential `tool_use` blocks at the end —
 * upstream fragments may interleave tools, and Anthropic blocks cannot be
 * reopened after `content_block_stop`.
 */
import { mapStopReason } from './chat-completions-response'
import { isPlainObject } from './object'

type Chunk = Record<string, unknown>

type OpenBlockType = 'thinking' | 'text'

const encoder = new TextEncoder()

function chatChunkToAnthropicEvent(frame: string, chunk: Chunk): string {
  return `event: ${frame}\ndata: ${JSON.stringify(chunk)}\n\n`
}

function deltaText(delta: Chunk): string {
  const content = delta.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part) => isPlainObject(part) && part.type === 'text')
    .map((part) => (typeof (part as Chunk).text === 'string' ? (part as Chunk).text : ''))
    .join('')
}

function deltaReasoning(delta: Chunk): string {
  for (const key of ['reasoning_content', 'reasoning']) {
    const value = delta[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return ''
}

/** Create a transformer converting Chat Completions SSE into Anthropic SSE. */
export function createChatCompletionsStream(
  model: string,
): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder()
  let buffer = ''
  let started = false
  let finished = false
  let messageId = ''
  let nextIndex = 0
  let openBlock: { type: OpenBlockType; index: number } | null = null
  const toolCalls = new Map<number, { id: string; name: string; args: string }>()
  let finishReason: unknown = null
  let hasToolUse = false
  let usage: Chunk | undefined

  function emit(
    controller: TransformStreamDefaultController<Uint8Array>,
    frame: string,
    event: Chunk,
  ) {
    controller.enqueue(encoder.encode(chatChunkToAnthropicEvent(frame, event)))
  }

  function ensureStarted(controller: TransformStreamDefaultController<Uint8Array>, chunk: Chunk) {
    if (started) return
    started = true
    messageId = typeof chunk.id === 'string' ? chunk.id : ''
    emit(controller, 'message_start', {
      type: 'message_start',
      message: {
        id: messageId,
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      },
    })
  }

  function closeOpenBlock(controller: TransformStreamDefaultController<Uint8Array>) {
    if (openBlock) {
      emit(controller, 'content_block_stop', { type: 'content_block_stop', index: openBlock.index })
      openBlock = null
    }
  }

  function openThinking(controller: TransformStreamDefaultController<Uint8Array>) {
    if (openBlock?.type === 'thinking') return
    closeOpenBlock(controller)
    const index = nextIndex++
    openBlock = { type: 'thinking', index }
    emit(controller, 'content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '' },
    })
  }

  function openText(controller: TransformStreamDefaultController<Uint8Array>) {
    if (openBlock?.type === 'text') return
    closeOpenBlock(controller)
    const index = nextIndex++
    openBlock = { type: 'text', index }
    emit(controller, 'content_block_start', {
      type: 'content_block_start',
      index,
      content_block: { type: 'text', text: '' },
    })
  }

  function emitToolCalls(controller: TransformStreamDefaultController<Uint8Array>) {
    for (const [toolIndex, call] of toolCalls) {
      const index = nextIndex++
      emit(controller, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'tool_use',
          id: call.id || `toolu_${toolIndex}`,
          name: call.name,
          input: {},
        },
      })
      if (call.args.length > 0) {
        emit(controller, 'content_block_delta', {
          type: 'content_block_delta',
          index,
          delta: { type: 'input_json_delta', partial_json: call.args },
        })
      }
      emit(controller, 'content_block_stop', { type: 'content_block_stop', index })
    }
  }

  function finish(controller: TransformStreamDefaultController<Uint8Array>) {
    if (finished) return
    finished = true
    // Upstream may end without a single data frame (empty body, bare
    // [DONE]); message_start must still lead the sequence or the SDK
    // cannot parse the tail events.
    ensureStarted(controller, {})
    closeOpenBlock(controller)
    emitToolCalls(controller)
    emit(controller, 'message_delta', {
      type: 'message_delta',
      delta: { stop_reason: mapStopReason(finishReason, hasToolUse), stop_sequence: null },
      usage: { output_tokens: (usage?.completion_tokens as number | undefined) ?? 0 },
    })
    emit(controller, 'message_stop', { type: 'message_stop' })
  }

  function processChunk(controller: TransformStreamDefaultController<Uint8Array>, chunk: Chunk) {
    ensureStarted(controller, chunk)
    if (isPlainObject(chunk.usage)) usage = chunk.usage
    const choice = Array.isArray(chunk.choices)
      ? (chunk.choices[0] as Chunk | undefined)
      : undefined
    if (!choice) return
    const delta = isPlainObject(choice.delta) ? choice.delta : {}

    const reasoning = deltaReasoning(delta)
    if (reasoning) {
      openThinking(controller)
      emit(controller, 'content_block_delta', {
        type: 'content_block_delta',
        index: openBlock!.index,
        delta: { type: 'thinking_delta', thinking: reasoning },
      })
    }

    const text = deltaText(delta)
    if (text) {
      openText(controller)
      emit(controller, 'content_block_delta', {
        type: 'content_block_delta',
        index: openBlock!.index,
        delta: { type: 'text_delta', text },
      })
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const call of delta.tool_calls) {
        if (!isPlainObject(call)) continue
        const toolIndex = typeof call.index === 'number' ? call.index : 0
        let entry = toolCalls.get(toolIndex)
        if (!entry) {
          entry = { id: '', name: '', args: '' }
          toolCalls.set(toolIndex, entry)
        }
        if (!entry.id && typeof call.id === 'string' && call.id.length > 0) entry.id = call.id
        const fn = isPlainObject(call.function) ? call.function : {}
        if (!entry.name && typeof fn.name === 'string' && fn.name.length > 0) entry.name = fn.name
        if (typeof fn.arguments === 'string' && fn.arguments.length > 0) entry.args += fn.arguments
        hasToolUse = true
      }
    }

    if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
      finishReason = choice.finish_reason
    }
  }

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true })
      let separator = buffer.indexOf('\n')
      while (separator >= 0) {
        const line = buffer.slice(0, separator).trim()
        buffer = buffer.slice(separator + 1)
        separator = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (data === '[DONE]') {
          finish(controller)
          return
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(data)
        } catch {
          continue
        }
        if (isPlainObject(parsed)) processChunk(controller, parsed)
      }
    },
    flush(controller) {
      finish(controller)
    },
  })
}
