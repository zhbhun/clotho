// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { createChatCompletionsStream } from './chat-completions-stream'

const encoder = new TextEncoder()

function chatChunk(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function baseChunk(delta: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return chatChunk({
    id: 'chat-1',
    choices: [{ index: 0, delta, ...extra }],
  })
}

/** Pipe raw upstream SSE chunks through the transformer and parse the anthropic frames. */
async function translateStream(chunks: string[], model = 'zhipu/glm-5.3-flash') {
  const upstream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  const text = await new Response(upstream.pipeThrough(createChatCompletionsStream(model))).text()
  return text
    .split('\n\n')
    .filter((frame) => frame.trim().length > 0)
    .map((frame) =>
      JSON.parse(
        frame
          .split('\n')
          .find((line) => line.startsWith('data:'))!
          .slice(5)
          .trim(),
      ),
    )
}

describe('createChatCompletionsStream', () => {
  test('wraps text deltas in the anthropic stream event sequence', async () => {
    const events = await translateStream([
      baseChunk({ role: 'assistant', content: 'Hel' }),
      baseChunk({ content: 'lo' }),
      baseChunk({}, { finish_reason: 'stop' }),
      'data: [DONE]\n\n',
    ])

    expect(events).toEqual([
      {
        type: 'message_start',
        message: {
          id: 'chat-1',
          type: 'message',
          role: 'assistant',
          model: 'zhipu/glm-5.3-flash',
          content: [],
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } },
      { type: 'content_block_stop', index: 0 },
      {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 0 },
      },
      { type: 'message_stop' },
    ])
  })

  test('streams reasoning before text and closes the thinking block when text starts', async () => {
    const events = await translateStream([
      baseChunk({ reasoning_content: 'think part 1' }),
      baseChunk({ reasoning_content: ' part 2' }),
      baseChunk({ content: 'answer' }),
      baseChunk({}, { finish_reason: 'stop' }),
      'data: [DONE]\n\n',
    ])

    expect(events[1]).toEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    })
    expect(events[2].delta).toEqual({ type: 'thinking_delta', thinking: 'think part 1' })
    expect(events[3].delta).toEqual({ type: 'thinking_delta', thinking: ' part 2' })
    expect(events[4]).toEqual({ type: 'content_block_stop', index: 0 })
    expect(events[5]).toEqual({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'text', text: '' },
    })
    expect(events[6].delta).toEqual({ type: 'text_delta', text: 'answer' })
    expect(events.at(-3)).toEqual({ type: 'content_block_stop', index: 1 })
  })

  test('emits buffered tool blocks in upstream order when the stream finishes', async () => {
    const events = await translateStream([
      baseChunk({
        tool_calls: [{ index: 0, id: 'call_1', type: 'function', function: { name: 'list' } }],
      }),
      baseChunk({ tool_calls: [{ index: 0, function: { arguments: '{"path":' } }] }),
      baseChunk({ tool_calls: [{ index: 0, function: { arguments: '"/tmp"}' } }] }),
      baseChunk({}, { finish_reason: 'tool_calls' }),
      'data: [DONE]\n\n',
    ])

    expect(events[1]).toEqual({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'call_1', name: 'list', input: {} },
    })
    expect(events[2].delta).toEqual({
      type: 'input_json_delta',
      partial_json: '{"path":"/tmp"}',
    })
    expect(events[3]).toEqual({ type: 'content_block_stop', index: 0 })
    const messageDelta = events.find((event) => event.type === 'message_delta')
    expect(messageDelta.delta.stop_reason).toBe('tool_use')
  })

  test('emits one tool_use block per upstream tool when fragments interleave', async () => {
    const events = await translateStream([
      baseChunk({
        tool_calls: [
          {
            index: 0,
            id: 'call_1',
            type: 'function',
            function: { name: 'list', arguments: '{"a"' },
          },
        ],
      }),
      baseChunk({
        tool_calls: [
          {
            index: 1,
            id: 'call_2',
            type: 'function',
            function: { name: 'read', arguments: '{"b"' },
          },
        ],
      }),
      baseChunk({ tool_calls: [{ index: 0, function: { arguments: ':1}' } }] }),
      baseChunk({ tool_calls: [{ index: 1, function: { arguments: ':2}' } }] }),
      baseChunk({}, { finish_reason: 'tool_calls' }),
      'data: [DONE]\n\n',
    ])

    const starts = events.filter((event) => event.type === 'content_block_start')
    expect(starts).toEqual([
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'call_1', name: 'list', input: {} },
      },
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'call_2', name: 'read', input: {} },
      },
    ])
    expect(events.filter((event) => event.type === 'content_block_delta')).toEqual([
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"a":1}' },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{"b":2}' },
      },
    ])
    expect(
      events.filter((event) => event.type === 'content_block_stop').map((event) => event.index),
    ).toEqual([0, 1])
    const messageDelta = events.find((event) => event.type === 'message_delta')
    expect(messageDelta.delta.stop_reason).toBe('tool_use')
  })

  test('emits a valid empty message sequence when the upstream sends only [DONE]', async () => {
    const events = await translateStream(['data: [DONE]\n\n'])

    expect(events.map((event) => event.type)).toEqual([
      'message_start',
      'message_delta',
      'message_stop',
    ])
  })

  test('emits a valid empty message sequence when the upstream body is empty', async () => {
    const events = await translateStream([])

    expect(events.map((event) => event.type)).toEqual([
      'message_start',
      'message_delta',
      'message_stop',
    ])
  })

  test('reports upstream usage counters when the final chunk carries them', async () => {
    const events = await translateStream([
      baseChunk({ role: 'assistant', content: 'Hi' }),
      chatChunk({
        id: 'chat-1',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 25, completion_tokens: 44 },
      }),
      'data: [DONE]\n\n',
    ])

    expect(events[0].message.usage).toEqual({ input_tokens: 0, output_tokens: 0 })
    const messageDelta = events.find((event) => event.type === 'message_delta')
    expect(messageDelta.usage).toEqual({ output_tokens: 44 })
  })

  test('still emits a complete message sequence when the upstream closes without [DONE]', async () => {
    const events = await translateStream([baseChunk({ content: 'Hi' })])

    expect(events[0].type).toBe('message_start')
    expect(events.at(-1).type).toBe('message_stop')
    expect(events.at(-2).type).toBe('message_delta')
    expect(events.at(-3).type).toBe('content_block_stop')
  })

  test('ignores keep-alive comments and malformed frames without breaking the stream', async () => {
    const events = await translateStream([
      ': keep-alive\n\n',
      'not sse data at all\n\n',
      baseChunk({ content: 'ok' }),
      'data: [DONE]\n\n',
    ])

    expect(events.filter((event) => event.type === 'content_block_delta')).toHaveLength(1)
    expect(events.at(-1).type).toBe('message_stop')
  })
})
