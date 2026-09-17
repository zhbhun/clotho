// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type ClaudeEventSink, closeQuery, controlQuery, startQuery } from './runner'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn() }))
vi.mock('../logging/runtime', () => ({
  getLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}))

const proxy = { settingsEnv: () => ({}) }

describe('query attachment input', () => {
  let directory: string
  let received: Array<string | SDKUserMessage>
  let events: ClaudeEventSink

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'clotho-query-attachments-'))
    received = []
    events = {
      onOutput: vi.fn(),
      onError: vi.fn(),
      onComplete: vi.fn(),
      onToolRequest: vi.fn(),
    }
    vi.mocked(sdkQuery)
      .mockReset()
      .mockImplementation(({ prompt }) => {
        if (typeof prompt === 'string') received.push(prompt)
        async function* output() {
          if (typeof prompt !== 'string') {
            for await (const message of prompt) received.push(message)
          }
          yield { type: 'system', subtype: 'init', session_id: 'session-1' }
        }
        return Object.assign(output(), { close: () => {} }) as never
      })
  })

  afterEach(async () => {
    closeQuery('attachment-stream')
    await rm(directory, { recursive: true, force: true })
  })

  it('submits the actual local text file as a document alongside the prompt', async () => {
    const filePath = path.join(directory, 'notes.md')
    await writeFile(filePath, '# Notes\n实际内容')

    const { initialized } = startQuery(
      events,
      {
        streamId: 'attachment-stream',
        prompt: 'Review this',
        userMessageUuid: 'client-user-uuid',
        attachments: [{ name: 'notes.md', path: filePath }],
      },
      proxy,
    )
    await initialized

    expect(received).toEqual([
      {
        type: 'user',
        uuid: 'client-user-uuid',
        parent_tool_use_id: null,
        origin: { kind: 'human' },
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'Review this' },
            {
              type: 'document',
              title: 'notes.md',
              source: { type: 'text', media_type: 'text/plain', data: '# Notes\n实际内容' },
            },
          ],
        },
      },
    ])
  })

  it('submits a UUID-tagged structured message for a plain prompt', async () => {
    const { initialized } = startQuery(
      events,
      {
        streamId: 'attachment-stream',
        prompt: 'Hello',
        userMessageUuid: 'client-user-uuid',
      },
      proxy,
    )
    await initialized

    expect(received).toEqual([
      {
        type: 'user',
        uuid: 'client-user-uuid',
        parent_tool_use_id: null,
        origin: { kind: 'human' },
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      },
    ])
  })

  it('keeps ordinary @ references on the synchronous string-prompt path', async () => {
    const prompt = '@/missing/file.png explain this reference'
    const { initialized } = startQuery(events, { streamId: 'attachment-stream', prompt }, proxy)

    expect(received).toEqual([prompt])
    await initialized
    expect(events.onError).not.toHaveBeenCalled()
  })

  it('accepts an attachment without inventing prompt text', async () => {
    const { initialized } = startQuery(
      events,
      {
        streamId: 'attachment-stream',
        prompt: '',
        attachments: [
          {
            name: 'notes.md',
            content: {
              type: 'document',
              title: 'notes.md',
              source: { type: 'text', media_type: 'text/plain', data: 'Saved content' },
            },
          },
        ],
      },
      proxy,
    )
    await initialized

    expect(received).toEqual([
      {
        type: 'user',
        origin: { kind: 'human' },
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [
            {
              type: 'document',
              title: 'notes.md',
              source: { type: 'text', media_type: 'text/plain', data: 'Saved content' },
            },
          ],
        },
      },
    ])
  })

  it('reports unreadable attachments without launching a text-only request', async () => {
    const { initialized } = startQuery(
      events,
      {
        streamId: 'attachment-stream',
        prompt: 'Review this',
        attachments: [{ name: 'missing.txt', path: path.join(directory, 'missing.txt') }],
      },
      proxy,
    )
    await initialized

    expect(received).toEqual([])
    expect(events.onError).toHaveBeenCalledWith(
      'attachment-stream',
      expect.stringContaining('missing.txt'),
      expect.stringContaining('missing.txt'),
    )
    expect(events.onComplete).toHaveBeenCalledWith('attachment-stream', false)
  })

  it.each(['interrupt', 'close'] as const)(
    'does not launch a query after %s during file preparation',
    async (action) => {
      const filePath = path.join(directory, 'notes.md')
      await writeFile(filePath, 'content')
      const { initialized } = startQuery(
        events,
        {
          streamId: 'attachment-stream',
          prompt: 'Review this',
          attachments: [{ name: 'notes.md', path: filePath }],
        },
        proxy,
      )

      if (action === 'close') closeQuery('attachment-stream')
      else await controlQuery({ streamId: 'attachment-stream', command: 'interrupt' })
      await initialized

      expect(received).toEqual([])
      expect(events.onComplete).toHaveBeenCalledWith('attachment-stream', false)
    },
  )
})
