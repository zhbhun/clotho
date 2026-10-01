// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, test } from 'vitest'

import { countPromptTokens } from './token-count'

describe('countPromptTokens', () => {
  test('counts plain text', () => {
    const tokens = countPromptTokens({
      messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
    })
    expect(tokens).toBeGreaterThan(3)
    expect(tokens).toBeLessThan(12)
  })

  test('counts tool definitions the same way regardless of tool name', () => {
    const tool = {
      name: 'Bash',
      description: 'Executes a bash command and returns its output.',
      input_schema: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
    }
    const plain = countPromptTokens({ messages: [], tools: [tool] })
    const renamed = countPromptTokens({
      messages: [],
      tools: [{ ...tool, name: 'ToolSearch' }],
    })
    // the ToolSearch rename must not change the count — the zhipu endpoint
    // collapses any request containing that tool to the tool's own size
    expect(plain).toBe(renamed)
    expect(plain).toBeGreaterThan(20)
  })

  test('system blocks, tool_use and tool_result all contribute', () => {
    const base = { messages: [{ role: 'user', content: 'hi' }] }
    const withSystem = { ...base, system: 'You are a helpful assistant.'.repeat(10) }
    const withToolUse = {
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', name: 'Read', input: { path: 'src/app.tsx' } }],
        },
      ],
    }
    const withToolResult = {
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', content: 'file contents here\n'.repeat(20) }],
        },
      ],
    }
    expect(countPromptTokens(withSystem)).toBeGreaterThan(countPromptTokens(base))
    expect(countPromptTokens(withToolUse)).toBeGreaterThan(countPromptTokens(base))
    expect(countPromptTokens(withToolResult)).toBeGreaterThan(countPromptTokens(base))
  })

  test('handles a captured turn request from the wire', () => {
    const body = JSON.parse(readFileSync('/tmp/capture/414-messages?beta=true.json', 'utf8'))
    const tokens = countPromptTokens(body)
    // the same request measures ~12.6k through the 8317 gateway's tokenizer
    expect(tokens).toBeGreaterThan(9_000)
    expect(tokens).toBeLessThan(16_000)
  })

  test('never returns below one for empty bodies', () => {
    expect(countPromptTokens({})).toBe(1)
    expect(countPromptTokens({ messages: [] })).toBe(1)
  })
})
