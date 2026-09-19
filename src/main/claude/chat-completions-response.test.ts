// @vitest-environment node
import { describe, expect, test } from 'vitest'

import { chatCompletionsToAnthropic, chatErrorToAnthropic } from './chat-completions-response'

describe('chatCompletionsToAnthropic', () => {
  test('converts a plain text completion', () => {
    const anthropic = chatCompletionsToAnthropic(
      {
        id: 'chat-1',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '42' },
          },
        ],
        usage: { prompt_tokens: 25, completion_tokens: 44 },
      },
      'zhipu/glm-5.3-flash',
    )

    expect(anthropic).toEqual({
      id: 'chat-1',
      type: 'message',
      role: 'assistant',
      model: 'zhipu/glm-5.3-flash',
      content: [{ type: 'text', text: '42' }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 25, output_tokens: 44 },
    })
  })

  test('puts reasoning content into a leading thinking block', () => {
    const anthropic = chatCompletionsToAnthropic(
      {
        id: 'chat-2',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: { role: 'assistant', content: '42', reasoning_content: '7*6 is 42' },
          },
        ],
      },
      'zhipu/glm-5.3-flash',
    )

    expect(anthropic.content).toEqual([
      { type: 'thinking', thinking: '7*6 is 42' },
      { type: 'text', text: '42' },
    ])
  })

  test('converts tool calls into tool_use blocks and maps the stop reason', () => {
    const anthropic = chatCompletionsToAnthropic(
      {
        id: 'chat-3',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'list', arguments: '{"path":"/tmp"}' },
                },
              ],
            },
          },
        ],
      },
      'zhipu/glm-5.3-flash',
    )

    expect(anthropic.content).toEqual([
      { type: 'tool_use', id: 'call_1', name: 'list', input: { path: '/tmp' } },
    ])
    expect(anthropic.stop_reason).toBe('tool_use')
  })

  test('falls back to an empty tool input when arguments are not valid JSON', () => {
    const anthropic = chatCompletionsToAnthropic(
      {
        id: 'chat-4',
        choices: [
          {
            index: 0,
            finish_reason: 'tool_calls',
            message: {
              role: 'assistant',
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'list', arguments: '' } },
              ],
            },
          },
        ],
      },
      'zhipu/glm-5.3-flash',
    )

    expect(anthropic.content).toEqual([{ type: 'tool_use', id: 'call_1', name: 'list', input: {} }])
  })

  test('always keeps at least one content block', () => {
    const anthropic = chatCompletionsToAnthropic(
      {
        id: 'chat-5',
        choices: [
          { index: 0, finish_reason: 'stop', message: { role: 'assistant', content: null } },
        ],
      },
      'zhipu/glm-5.3-flash',
    )

    expect(anthropic.content).toEqual([{ type: 'text', text: '' }])
  })

  test('maps finish reasons to anthropic stop reasons', () => {
    const build = (finish_reason: string) =>
      chatCompletionsToAnthropic(
        {
          id: 'id',
          choices: [{ index: 0, finish_reason, message: { role: 'assistant', content: 'x' } }],
        },
        'm',
      )

    expect(build('length').stop_reason).toBe('max_tokens')
    expect(build('content_filter').stop_reason).toBe('refusal')
    expect(build('unknown_reason').stop_reason).toBe('end_turn')
  })
})

describe('chatErrorToAnthropic', () => {
  test('wraps an upstream error payload into the anthropic error shape', () => {
    const { status, body } = chatErrorToAnthropic(429, {
      error: { code: '1210', message: '该模型始终思考，不支持关闭思考；请使用 low、high 或 max。' },
    })

    expect(status).toBe(429)
    expect(body).toEqual({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: '该模型始终思考，不支持关闭思考；请使用 low、high 或 max。',
      },
    })
  })

  test('maps status codes to anthropic error types and survives non-JSON payloads', () => {
    expect(chatErrorToAnthropic(400, null).body.error.type).toBe('invalid_request_error')
    expect(chatErrorToAnthropic(401, undefined).body.error.type).toBe('authentication_error')
    expect(chatErrorToAnthropic(404, {}).body.error.type).toBe('not_found_error')
    expect(chatErrorToAnthropic(503, 'upstream exploded').body.error.message).toBe(
      'upstream exploded',
    )
    expect(chatErrorToAnthropic(500, { error: {} }).body.error.type).toBe('api_error')
  })
})
