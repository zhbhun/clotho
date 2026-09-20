import { describe, expect, it } from 'vitest'

import { claudeJsonToMessage } from './message'

describe('Claude message parsing', () => {
  it('keeps uploaded image-only user turns instead of dropping them as empty text', () => {
    const content = {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'aW1hZ2U=' },
    }
    expect(
      claudeJsonToMessage({ type: 'user', message: { role: 'user', content: [content] } }),
    ).toMatchObject({ role: 'user', content: '', attachments: [{ name: 'image.png', content }] })
  })

  it('keeps document contents separate from the prompt for display and historical resends', () => {
    const document = {
      type: 'document',
      title: 'AGENTS.md',
      source: { type: 'text', media_type: 'text/plain', data: 'Document instructions' },
    }
    expect(
      claudeJsonToMessage({
        type: 'user',
        message: {
          role: 'user',
          content: [document, { type: 'text', text: 'Compare @src/app.tsx' }],
        },
      }),
    ).toMatchObject({
      role: 'user',
      content: 'Compare @src/app.tsx',
      attachments: [{ name: 'AGENTS.md', content: document }],
    })
  })

  it('maps assistant UUIDs and CLI interruption markers from persisted JSON', () => {
    expect(
      claudeJsonToMessage({
        type: 'assistant',
        uuid: 'assistant-uuid',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Final reply' }] },
      }),
    ).toMatchObject({ uuid: 'assistant-uuid', role: 'assistant', content: 'Final reply' })
    expect(
      claudeJsonToMessage({
        type: 'user',
        message: {
          role: 'user',
          content: [{ type: 'text', text: '[Request interrupted by user]' }],
        },
      })?.isInterruption,
    ).toBe(true)
  })

  it('skips the synthetic no-response frame written after cancellation', () => {
    expect(
      claudeJsonToMessage({
        type: 'assistant',
        uuid: 'synthetic-cleanup-uuid',
        message: {
          role: 'assistant',
          model: '<synthetic>',
          content: [{ type: 'text', text: 'No response requested.' }],
        },
      } as never),
    ).toBeNull()
  })

  it('renders live local slash-command output as an assistant reply', () => {
    expect(
      claudeJsonToMessage({
        type: 'system',
        subtype: 'local_command_output',
        content: 'Current usage: 10%',
        uuid: 'local-output-uuid',
        session_id: 'claude-session',
      }),
    ).toMatchObject({
      role: 'assistant',
      content: 'Current usage: 10%',
    })
  })

  it('unwraps persisted local slash-command output as an assistant reply', () => {
    expect(
      claudeJsonToMessage({
        type: 'system',
        subtype: 'local_command',
        content: '<local-command-stdout>Current usage: 10%</local-command-stdout>',
        uuid: 'persisted-local-output-uuid',
        parentUuid: 'command-user-uuid',
      }),
    ).toMatchObject({
      role: 'assistant',
      content: 'Current usage: 10%',
    })
  })

  it('normalizes persisted slash commands to exactly one leading slash', () => {
    expect(
      claudeJsonToMessage({
        type: 'user',
        uuid: 'command-user-uuid',
        message: {
          role: 'user',
          content:
            '<command-message>prototype</command-message><command-name>/prototype</command-name><command-args>在 docs/changes/mvp/protocol.html 生成原型</command-args>',
        },
      }),
    ).toMatchObject({
      commandArgs: '在 docs/changes/mvp/protocol.html 生成原型',
      commandName: 'prototype',
      content: '/prototype 在 docs/changes/mvp/protocol.html 生成原型',
      isCommand: true,
    })
  })
})

describe('API retry parsing', () => {
  it('parses a live wire api_retry event into an apiRetry message', () => {
    expect(
      claudeJsonToMessage({
        type: 'system',
        subtype: 'api_retry',
        uuid: 'retry-uuid',
        attempt: 3,
        max_retries: 10,
        retry_delay_ms: 38609,
        error_status: 429,
        error: 'rate_limit',
        timestamp: '2026-09-20T09:04:05.706Z',
      }),
    ).toMatchObject({
      role: 'system',
      uuid: 'retry-uuid',
      apiRetry: {
        attempt: 3,
        maxRetries: 10,
        retryDelayMs: 38609,
        status: 429,
        kind: 'rate_limit',
      },
    })
  })

  it('parses a persisted transcript api_error retry with the provider detail', () => {
    expect(
      claudeJsonToMessage({
        type: 'system',
        subtype: 'api_error',
        source: 'request_retry',
        retryAttempt: 6,
        maxRetries: 10,
        retryInMs: 18115,
        error: {
          status: 429,
          formatted: '429 [1310][您已达到每周/每月使用上限][2026092017034786ee1474d7fa4242]',
        },
      }),
    ).toMatchObject({
      role: 'system',
      apiRetry: {
        attempt: 6,
        maxRetries: 10,
        retryDelayMs: 18115,
        status: 429,
        detail: '429 [1310][您已达到每周/每月使用上限][2026092017034786ee1474d7fa4242]',
      },
    })
  })

  it('ignores non-retry api_error entries and malformed retry events', () => {
    expect(
      claudeJsonToMessage({ type: 'system', subtype: 'api_error', error: { status: 500 } }),
    ).toBeNull()
    expect(
      claudeJsonToMessage({ type: 'system', subtype: 'api_retry', error_status: 429 }),
    ).toBeNull()
  })
})
