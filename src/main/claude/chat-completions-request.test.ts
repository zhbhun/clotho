// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { anthropicToChatCompletions, estimatePromptTokens } from './chat-completions-request'

describe('anthropicToChatCompletions', () => {
  test('moves the system prompt and text messages into chat messages', () => {
    const chat = anthropicToChatCompletions(
      {
        model: 'glm-5.3-flash',
        max_tokens: 1024,
        system: 'You are helpful.',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
        ],
      },
      { mode: 'effort', level: 'max' },
    )

    expect(chat).toEqual({
      model: 'glm-5.3-flash',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ],
      reasoning_effort: 'max',
    })
  })

  test('omits thinking params when none are configured', () => {
    const chat = anthropicToChatCompletions(
      { model: 'm', messages: [{ role: 'user', content: 'Hi' }] },
      undefined,
    )

    expect(chat).not.toHaveProperty('reasoning_effort')
    expect(chat).not.toHaveProperty('thinking')
    expect(chat.messages).toEqual([{ role: 'user', content: 'Hi' }])
  })

  test('sends the thinking switch for on/off models', () => {
    const on = anthropicToChatCompletions(
      { model: 'm', messages: [{ role: 'user', content: 'Hi' }] },
      { mode: 'on', switchStyle: 'thinking' },
    )
    expect(on.thinking).toEqual({ type: 'enabled' })
    expect(on).not.toHaveProperty('reasoning_effort')

    const off = anthropicToChatCompletions(
      { model: 'm', messages: [{ role: 'user', content: 'Hi' }] },
      { mode: 'off', switchStyle: 'thinking' },
    )
    expect(off.thinking).toEqual({ type: 'disabled' })
    expect(off).not.toHaveProperty('reasoning_effort')
  })

  test('expresses the switch as enable_thinking for qwen-style families', () => {
    const on = anthropicToChatCompletions(
      { model: 'm', messages: [{ role: 'user', content: 'Hi' }] },
      { mode: 'on', switchStyle: 'enable-thinking' },
    )
    expect(on.enable_thinking).toBe(true)
    expect(on).not.toHaveProperty('thinking')

    const off = anthropicToChatCompletions(
      { model: 'm', messages: [{ role: 'user', content: 'Hi' }] },
      { mode: 'off', switchStyle: 'enable-thinking' },
    )
    expect(off.enable_thinking).toBe(false)
    expect(off).not.toHaveProperty('thinking')
  })

  test('converts tool definitions, assistant tool calls, and tool results', () => {
    const chat = anthropicToChatCompletions(
      {
        model: 'm',
        messages: [
          { role: 'user', content: 'List files' },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'Checking.' },
              { type: 'thinking', thinking: 'need a tool' },
              { type: 'tool_use', id: 'toolu_1', name: 'list', input: { path: '/tmp' } },
            ],
          },
          {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_1', content: 'a.txt\nb.txt' },
              { type: 'text', text: 'Continue please' },
            ],
          },
        ],
        tools: [
          {
            name: 'list',
            description: 'List files',
            input_schema: { type: 'object', properties: { path: { type: 'string' } } },
          },
        ],
        tool_choice: { type: 'any' },
      },
      { mode: 'effort', level: 'high' },
    )

    expect(chat.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'list',
          description: 'List files',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    ])
    expect(chat.tool_choice).toBe('required')
    expect(chat.messages).toEqual([
      { role: 'user', content: 'List files' },
      {
        role: 'assistant',
        content: 'Checking.',
        tool_calls: [
          {
            id: 'toolu_1',
            type: 'function',
            function: { name: 'list', arguments: '{"path":"/tmp"}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'toolu_1', content: 'a.txt\nb.txt' },
      { role: 'user', content: 'Continue please' },
    ])
  })

  test('maps tool_choice any and tool name variants', () => {
    const auto = anthropicToChatCompletions(
      { model: 'm', messages: [], tool_choice: { type: 'auto' } },
      { mode: 'on' },
    )
    expect(auto.tool_choice).toBe('auto')

    const named = anthropicToChatCompletions(
      { model: 'm', messages: [], tool_choice: { type: 'tool', name: 'list' } },
      undefined,
    )
    expect(named.tool_choice).toEqual({
      type: 'function',
      function: { name: 'list' },
    })
  })

  test('converts base64 images and stop sequences and keeps sampling params', () => {
    const chat = anthropicToChatCompletions(
      {
        model: 'm',
        max_tokens: 99,
        temperature: 0.2,
        top_p: 0.9,
        stop_sequences: ['END', 'STOP'],
        stream: true,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: 'aGk=' },
              },
            ],
          },
        ],
      },
      { mode: 'effort', level: 'low' },
    )

    expect(chat.temperature).toBe(0.2)
    expect(chat.top_p).toBe(0.9)
    expect(chat.stop).toEqual(['END', 'STOP'])
    expect(chat.stream).toBe(true)
    expect(chat.stream_options).toEqual({ include_usage: true })
    expect(chat.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,aGk=' } },
        ],
      },
    ])
  })

  test('flattens block-array system prompts into one system message', () => {
    const chat = anthropicToChatCompletions(
      {
        model: 'm',
        system: [
          { type: 'text', text: 'First part.' },
          { type: 'text', text: 'Second part.' },
        ],
        messages: [],
      },
      { mode: 'off' },
    )

    expect(chat.messages).toEqual([{ role: 'system', content: 'First part.\nSecond part.' }])
  })
})

describe('estimatePromptTokens', () => {
  test('approximates one token per four characters of the serialized request', () => {
    const body = {
      model: 'm',
      system: 'abcd',
      messages: [{ role: 'user', content: 'abcd'.repeat(10) }],
      tools: [{ name: 'tool' }],
    }
    const expected = Math.ceil(
      JSON.stringify({ system: body.system, messages: body.messages, tools: body.tools }).length /
        4,
    )

    expect(estimatePromptTokens(body)).toBe(expected)
  })

  test('never returns zero', () => {
    expect(estimatePromptTokens({ messages: [] })).toBeGreaterThanOrEqual(1)
  })
})
