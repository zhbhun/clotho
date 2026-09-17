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
