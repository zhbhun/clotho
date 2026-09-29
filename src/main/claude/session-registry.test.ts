// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { controlQuery, startQuery } from './runner'
import { sessionRecycleGate } from './session-registry'
import { createSessionQueryRegistry } from './session-registry'

vi.mock('../logging/runtime', () => ({
  getLogger: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn() }),
}))

const idle = { turnInFlight: false, pendingToolRequestIds: [], backgroundTaskIds: [] }

describe('session recycle gate', () => {
  it('allows recycling a fully idle query', () => {
    expect(sessionRecycleGate(idle)).toEqual({ canRecycle: true, busy: [] })
  })

  it('blocks while a turn is in flight', () => {
    expect(sessionRecycleGate({ ...idle, turnInFlight: true })).toEqual({
      canRecycle: false,
      busy: ['turn-in-flight'],
    })
  })

  it('blocks while a permission decision is still owed', () => {
    expect(sessionRecycleGate({ ...idle, pendingToolRequestIds: ['tool-1'] })).toEqual({
      canRecycle: false,
      busy: ['pending-permissions'],
    })
  })

  it('blocks while a background task is running', () => {
    expect(sessionRecycleGate({ ...idle, backgroundTaskIds: ['task-1'] })).toEqual({
      canRecycle: false,
      busy: ['background-tasks'],
    })
  })

  it('reports every blocking reason together', () => {
    expect(
      sessionRecycleGate({
        turnInFlight: true,
        pendingToolRequestIds: ['tool-1'],
        backgroundTaskIds: ['task-1'],
      }),
    ).toEqual({
      canRecycle: false,
      busy: ['turn-in-flight', 'pending-permissions', 'background-tasks'],
    })
  })
})

const { queuePushes } = vi.hoisted(() => ({ queuePushes: [] as unknown[] }))

vi.mock('./runner', () => ({
  AsyncInputQueue: class {
    push = vi.fn((value: unknown) => {
      queuePushes.push(value)
    })
    finish = vi.fn()
  },
  startQuery: vi.fn(),
  controlQuery: vi.fn(async () => undefined),
  closeQuery: vi.fn(async () => {}),
  pendingToolRequestIds: vi.fn(() => []),
  respondToolRequest: vi.fn(),
}))

vi.mock('./attachments', () => ({
  prepareAttachments: vi.fn(async (attachments: Array<{ name: string }>) =>
    attachments.map((attachment) => ({ type: 'document', title: attachment.name })),
  ),
}))

function sink() {
  return { onOutput: vi.fn(), onError: vi.fn(), onComplete: vi.fn(), onToolRequest: vi.fn() }
}

function proxyOf(thinking?: { effort?: 'low' | 'medium' | 'high' }) {
  return { sessionThinking: vi.fn(() => thinking) } as never
}

describe('session query push', () => {
  it('combines prompt and attachments into one human-origin SDK user message', async () => {
    const registry = createSessionQueryRegistry(sink(), proxyOf())
    const { streamId } = await registry.ensure({ sessionId: 's1', options: {} as never })

    await registry.push({
      streamId,
      text: 'Review this',
      userMessageUuid: 'client-user-uuid',
      attachments: [{ name: 'notes.md', path: '/tmp/notes.md' }],
    })

    expect(queuePushes.at(-1)).toEqual({
      type: 'user',
      uuid: 'client-user-uuid',
      parent_tool_use_id: null,
      origin: { kind: 'human' },
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'Review this' },
          { type: 'document', title: 'notes.md' },
        ],
      },
    })
  })

  it('marks auto-continuation pushes as synthetic', async () => {
    const registry = createSessionQueryRegistry(sink(), proxyOf())
    const { streamId } = await registry.ensure({ sessionId: 's1', options: {} as never })

    await registry.push({ streamId, text: 'continue', syntheticOrigin: 'auto-continuation' })

    expect(queuePushes.at(-1)).toMatchObject({
      isSynthetic: true,
      origin: { kind: 'auto-continuation' },
    })
  })
})

describe('session query model switch', () => {
  beforeEach(() => {
    vi.mocked(startQuery).mockClear()
    vi.mocked(controlQuery).mockClear()
  })

  async function ensuredRegistry(model: string, thinking?: { effort?: 'high' }) {
    const registry = createSessionQueryRegistry(sink(), proxyOf(thinking))
    await registry.ensure({ sessionId: 's1', options: { model } as never })
    vi.mocked(controlQuery).mockClear()
    return registry
  }

  it('switches the live query to another proxy model and replays its effort', async () => {
    const registry = await ensuredRegistry('zhipu/glm-5.2', { effort: 'high' })

    expect(await registry.setModel({ sessionId: 's1', model: 'zhipu/glm-5.3' })).toEqual({
      applied: true,
    })
    expect(controlQuery).toHaveBeenCalledWith({
      streamId: expect.any(String),
      command: 'setModel',
      params: ['zhipu/glm-5.3'],
    })
    expect(controlQuery).toHaveBeenCalledWith({
      streamId: expect.any(String),
      command: 'applyFlagSettings',
      params: [{ effortLevel: 'high' }],
    })
  })

  it('strips the claude prefix for claude-to-claude switches', async () => {
    const registry = await ensuredRegistry('claude/sonnet-4-6')

    expect(await registry.setModel({ sessionId: 's1', model: 'claude/opus-4-6' })).toEqual({
      applied: true,
    })
    expect(controlQuery).toHaveBeenCalledTimes(1)
    expect(controlQuery).toHaveBeenCalledWith({
      streamId: expect.any(String),
      command: 'setModel',
      params: ['opus-4-6'],
    })
  })

  it('refuses a cross-class switch so the caller rebuilds instead', async () => {
    const registry = await ensuredRegistry('zhipu/glm-5.2')

    expect(await registry.setModel({ sessionId: 's1', model: 'claude/sonnet-4-6' })).toEqual({
      applied: false,
      reason: 'model-class',
    })
    expect(controlQuery).not.toHaveBeenCalled()
  })

  it('reports a missing query', async () => {
    const registry = createSessionQueryRegistry(sink(), proxyOf())

    expect(await registry.setModel({ sessionId: 'missing', model: 'zhipu/glm-5.2' })).toEqual({
      applied: false,
      reason: 'missing',
    })
  })
})
