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

const { queuePushes, livePending } = vi.hoisted(() => ({
  queuePushes: [] as unknown[],
  livePending: new Set<string>(),
}))

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
  pendingToolRequestIds: vi.fn(() => [...livePending]),
  respondToolRequest: vi.fn((_streamId: string, toolUseId: string) => {
    livePending.delete(toolUseId)
  }),
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

  it('broadcasts the pushed user message so watching windows see the new turn', async () => {
    const events = sink()
    const registry = createSessionQueryRegistry(events, proxyOf())
    const { streamId } = await registry.ensure({ sessionId: 's1', options: {} as never })
    events.onOutput.mockClear()

    await registry.push({ streamId, text: 'Hello both', userMessageUuid: 'shared-uuid' })

    expect(events.onOutput).toHaveBeenCalledWith(
      streamId,
      expect.objectContaining({
        type: 'user',
        uuid: 'shared-uuid',
        parent_tool_use_id: null,
        origin: { kind: 'human' },
        message: { role: 'user', content: [{ type: 'text', text: 'Hello both' }] },
      }),
    )
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

/** The decorated sink the registry handed to startQuery, to drive frames by hand. */
function decoratedSink() {
  return vi.mocked(startQuery).mock.calls.at(-1)![0]
}

describe('session query attach', () => {
  beforeEach(() => {
    vi.mocked(startQuery).mockClear()
    livePending.clear()
  })

  it('never spawns a query and reports null while none is live', async () => {
    const registry = createSessionQueryRegistry(sink(), proxyOf())

    expect(registry.attach({ sessionId: 's1' })).toBeNull()
    expect(startQuery).not.toHaveBeenCalled()
  })

  it('returns the live snapshot without creating a second query', async () => {
    const registry = createSessionQueryRegistry(sink(), proxyOf())
    const ensured = await registry.ensure({
      sessionId: 's1',
      options: { model: 'zhipu/glm-5.2', agent: 'reviewer' } as never,
    })
    vi.mocked(startQuery).mockClear()

    const attached = registry.attach({ sessionId: 's1' })

    expect(attached?.streamId).toBe(ensured.streamId)
    expect(attached?.state.model).toBe('zhipu/glm-5.2')
    expect(attached?.state.agent).toBe('reviewer')
    expect(startQuery).not.toHaveBeenCalled()
  })
})

describe('session view holders', () => {
  beforeEach(() => {
    vi.mocked(startQuery).mockClear()
    livePending.clear()
  })

  async function liveRegistry() {
    const registry = createSessionQueryRegistry(sink(), proxyOf())
    await registry.ensure({ sessionId: 's1', options: {} as never })
    vi.mocked(startQuery).mockClear()
    return registry
  }

  it('keeps a warm query when another window still shows the session', async () => {
    const registry = await liveRegistry()
    registry.viewOpened('s1', 'w1')

    expect(registry.recycleCheck({ sessionId: 's1', windowId: 'w2' })).toEqual({
      recycled: false,
      busy: ['open-elsewhere'],
    })
    expect(registry.attach({ sessionId: 's1' })).not.toBeNull()
  })

  it('recycles for the holder itself and once the last view is gone', async () => {
    const registry = await liveRegistry()
    registry.viewOpened('s1', 'w1')

    expect(registry.recycleCheck({ sessionId: 's1', windowId: 'w1' })).toEqual({
      recycled: true,
      busy: [],
    })

    const second = await liveRegistry()
    second.viewOpened('s1', 'w1')
    second.viewClosed('s1', 'w1')
    expect(second.recycleCheck({ sessionId: 's1', windowId: 'w2' })).toEqual({
      recycled: true,
      busy: [],
    })
  })

  it('drops every hold of a closed window', async () => {
    const registry = await liveRegistry()
    registry.viewOpened('s1', 'w1')
    registry.viewOpened('s2', 'w1')
    registry.dropWindow('w1')

    expect(registry.recycleCheck({ sessionId: 's1', windowId: 'w2' })).toEqual({
      recycled: true,
      busy: [],
    })
  })
})

describe('session runtime changes', () => {
  beforeEach(() => {
    vi.mocked(startQuery).mockClear()
    vi.mocked(controlQuery).mockClear()
    livePending.clear()
  })

  it('announces a new query, turn flips, tool requests, and teardown', async () => {
    const onRuntimeChanged = vi.fn()
    const registry = createSessionQueryRegistry(sink(), proxyOf(), { onRuntimeChanged })
    const { streamId } = await registry.ensure({ sessionId: 's1', options: {} as never })
    expect(onRuntimeChanged).toHaveBeenLastCalledWith({
      sessionId: 's1',
      streamId,
      deadStreamId: null,
      turnInFlight: false,
      pendingToolRequestIds: [],
    })

    const events = decoratedSink()
    events.onOutput(streamId, { type: 'user' } as never)
    expect(onRuntimeChanged).toHaveBeenLastCalledWith({
      sessionId: 's1',
      streamId,
      deadStreamId: null,
      turnInFlight: true,
      pendingToolRequestIds: [],
    })

    livePending.add('tool-1')
    events.onToolRequest(streamId, {
      kind: 'permission',
      toolName: 'Write',
      toolUseId: 'tool-1',
    } as never)
    expect(onRuntimeChanged).toHaveBeenLastCalledWith({
      sessionId: 's1',
      streamId,
      deadStreamId: null,
      turnInFlight: true,
      pendingToolRequestIds: ['tool-1'],
    })

    expect(
      registry.respondTool({
        streamId,
        toolUseId: 'tool-1',
        result: { behavior: 'deny', message: 'denied by test' },
      }),
    ).toBe(true)
    expect(onRuntimeChanged).toHaveBeenLastCalledWith({
      sessionId: 's1',
      streamId,
      deadStreamId: null,
      turnInFlight: true,
      pendingToolRequestIds: [],
    })

    events.onOutput(streamId, { type: 'result' } as never)
    expect(onRuntimeChanged).toHaveBeenLastCalledWith({
      sessionId: 's1',
      streamId,
      deadStreamId: null,
      turnInFlight: false,
      pendingToolRequestIds: [],
    })

    await registry.close('s1')
    expect(onRuntimeChanged).toHaveBeenLastCalledWith({
      sessionId: 's1',
      streamId: null,
      deadStreamId: streamId,
      turnInFlight: false,
      pendingToolRequestIds: [],
    })
  })

  it('stays silent for frames that do not change the live shape', async () => {
    const onRuntimeChanged = vi.fn()
    const registry = createSessionQueryRegistry(sink(), proxyOf(), { onRuntimeChanged })
    const { streamId } = await registry.ensure({ sessionId: 's1', options: {} as never })
    onRuntimeChanged.mockClear()

    const events = decoratedSink()
    events.onOutput(streamId, { type: 'user' } as never)
    expect(onRuntimeChanged).toHaveBeenCalledTimes(1)

    onRuntimeChanged.mockClear()
    events.onOutput(streamId, { type: 'assistant' } as never)
    events.onOutput(streamId, { type: 'assistant' } as never)

    expect(onRuntimeChanged).not.toHaveBeenCalled()
  })
})
