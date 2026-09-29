import { describe, expect, it } from 'vitest'

import { StreamAssembler } from './message-stream'

const line = (value: unknown) => JSON.stringify(value)

describe('StreamAssembler', () => {
  it('does not carry the optimistic send time onto the persisted message', () => {
    const stream = new StreamAssembler()
    const optimistic = {
      id: 'local-user-1',
      role: 'user' as const,
      content: 'continue',
      timestamp: '2026-08-27T10:00:00.000Z',
    }
    stream.commit(optimistic)

    stream.replaceCommitted('local-user-1', {
      id: 'persisted-user-1',
      uuid: 'persisted-user-uuid',
      role: 'user',
      content: 'continue',
    })
    expect(stream.getAll()[0]).toMatchObject({ id: 'persisted-user-1' })
    expect(stream.getAll()[0]?.timestamp).toBeUndefined()

    stream.reset([optimistic])
    stream.replaceCommitted('local-user-1', {
      id: 'persisted-user-2',
      role: 'user',
      content: 'continue',
      timestamp: '2026-08-27T10:00:01.000Z',
    })
    expect(stream.getAll()[0]).toMatchObject({
      id: 'persisted-user-2',
      timestamp: '2026-08-27T10:00:01.000Z',
    })
  })

  it('shows partial text and replaces its placeholder with the completed assistant message', () => {
    const stream = new StreamAssembler()
    stream.processLine(line({ type: 'stream_event', event: { type: 'message_start' } }))
    stream.processLine(
      line({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'partial' },
        },
      }),
    )
    expect(stream.getAll()).toMatchObject([{ role: 'assistant', content: 'partial' }])

    stream.processLine(
      line({
        type: 'assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'final' }] },
      }),
      '2026-07-26T12:34:56.000Z',
    )
    expect(stream.getAll()).toMatchObject([
      { role: 'assistant', content: 'final', timestamp: '2026-07-26T12:34:56.000Z' },
    ])
  })

  it('ignores transcript entries replayed after they were already streamed', () => {
    const stream = new StreamAssembler()
    const user = {
      type: 'user',
      uuid: 'user-1',
      message: { role: 'user', content: 'hello222?' },
    }
    const assistant = {
      type: 'assistant',
      uuid: 'assistant-1',
      message: { role: 'assistant', content: [{ type: 'text', text: '你好！' }] },
    }

    stream.processLine(line(user))
    stream.processLine(line(assistant))
    // The follower starts from the offset captured before the query and replays both entries.
    stream.processLine(line(user))
    stream.processLine(line(assistant))

    expect(stream.getAll()).toMatchObject([
      { role: 'user', uuid: 'user-1', content: 'hello222?' },
      { role: 'assistant', uuid: 'assistant-1', content: '你好！' },
    ])
    expect(stream.getAll()).toHaveLength(2)
  })

  it('assembles tool input json without exposing incomplete or invalid fragments', () => {
    const stream = new StreamAssembler()
    stream.processLine(line({ type: 'stream_event', event: { type: 'message_start' } }))
    stream.processLine(
      line({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tool-1', name: 'Bash' },
        },
      }),
    )
    stream.processLine(
      line({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"command":"ls"}' },
        },
      }),
    )
    stream.processLine(
      line({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }),
    )

    expect(stream.getAll()[0]?.blocks).toEqual([
      { type: 'tool_use', toolUseId: 'tool-1', name: 'Bash', input: { command: 'ls' } },
    ])

    const malformed = new StreamAssembler()
    malformed.processLine(line({ type: 'stream_event', event: { type: 'message_start' } }))
    malformed.processLine(
      line({
        type: 'stream_event',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: 'tool-2', name: 'Bash' },
        },
      }),
    )
    malformed.processLine(
      line({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: 'not-json' },
        },
      }),
    )
    malformed.processLine(
      line({ type: 'stream_event', event: { type: 'content_block_stop', index: 0 } }),
    )
    expect(malformed.getAll()[0]?.blocks?.[0]).toEqual({
      type: 'tool_use',
      toolUseId: 'tool-2',
      name: 'Bash',
    })
  })

  it('streams thinking and text segments across their assistant frames without duplication', () => {
    const stream = new StreamAssembler()
    // The CLI emits a fresh uuid per stream_event line; deltas must still
    // reach the placeholder of the message.
    stream.processLine(
      line({ type: 'stream_event', uuid: 'evt-1', event: { type: 'message_start' } }),
    )
    stream.processLine(
      line({
        type: 'stream_event',
        uuid: 'evt-2',
        event: {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '' },
        },
      }),
    )
    stream.processLine(
      line({
        type: 'stream_event',
        uuid: 'evt-3',
        event: {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: '思考中' },
        },
      }),
    )
    expect(stream.getAll()).toHaveLength(1)
    expect(stream.getAll()[0]).toMatchObject({ blocks: [{ type: 'thinking', text: '思考中' }] })

    // The finished thinking segment is committed as its own assistant frame
    // while the same message keeps streaming the text block (index 1).
    stream.processLine(
      line({
        type: 'assistant',
        uuid: 'assistant-thinking',
        message: { role: 'assistant', content: [{ type: 'thinking', thinking: '思考中' }] },
      }),
    )
    stream.processLine(
      line({
        type: 'stream_event',
        uuid: 'evt-4',
        event: {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'text', text: '' },
        },
      }),
    )
    stream.processLine(
      line({
        type: 'stream_event',
        uuid: 'evt-5',
        event: {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'text_delta', text: '你好' },
        },
      }),
    )
    // The committed thinking no longer renders from the placeholder and the
    // streaming text continues to accumulate in it.
    expect(stream.getAll()).toMatchObject([
      { uuid: 'assistant-thinking', blocks: [{ type: 'thinking', text: '思考中' }] },
      { blocks: [{ type: 'text', text: '你好' }], content: '你好' },
    ])

    stream.processLine(
      line({
        type: 'assistant',
        uuid: 'assistant-text',
        message: { role: 'assistant', content: [{ type: 'text', text: '你好' }] },
      }),
    )
    stream.processLine(
      line({ type: 'stream_event', uuid: 'evt-6', event: { type: 'message_stop' } }),
    )
    expect(stream.getAll()).toMatchObject([
      { uuid: 'assistant-thinking', blocks: [{ type: 'thinking', text: '思考中' }] },
      { uuid: 'assistant-text', content: '你好' },
    ])
  })

  it('keeps concurrent subagent streams separated by parent tool and finalizes only the matching stream', () => {
    const stream = new StreamAssembler()
    for (const [parentToolUseId, text] of [
      ['task-a', 'partial a'],
      ['task-b', 'partial b'],
    ] as const) {
      let eventIndex = 0
      const nextEventUuid = () => `evt-${parentToolUseId}-${++eventIndex}`
      stream.processLine(
        line({
          type: 'stream_event',
          uuid: nextEventUuid(),
          parent_tool_use_id: parentToolUseId,
          event: { type: 'message_start' },
        }),
      )
      stream.processLine(
        line({
          type: 'stream_event',
          uuid: nextEventUuid(),
          parent_tool_use_id: parentToolUseId,
          event: {
            type: 'content_block_delta',
            index: 0,
            delta: { type: 'text_delta', text },
          },
        }),
      )
    }
    stream.processLine(
      line({
        type: 'assistant',
        uuid: 'assistant-a',
        parent_tool_use_id: 'task-a',
        message: { role: 'assistant', content: [{ type: 'text', text: 'final a' }] },
      }),
    )

    expect(stream.getAll()).toMatchObject([
      { uuid: 'assistant-a', parentToolUseId: 'task-a', content: 'final a' },
      { parentToolUseId: 'task-b', content: 'partial b' },
    ])
  })

  it('returns false for lines that need the caller fallback parser', () => {
    const stream = new StreamAssembler()
    expect(stream.processLine('not json')).toBe(false)
    expect(stream.processLine(line({ type: 'system', subtype: 'init' }))).toBe(false)
  })
})
