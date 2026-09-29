import { beforeEach, describe, expect, it, vi } from 'vitest'

import { claude } from './claude'

const desktopMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  return {
    isDesktopRuntime: vi.fn(() => true),
    requestFromDesktop: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
    listenDesktopEvent: vi.fn(async (eventName: string, handler: (payload: unknown) => void) => {
      const handlers = listeners.get(eventName) ?? new Set()
      handlers.add(handler)
      listeners.set(eventName, handlers)
      return () => handlers.delete(handler)
    }),
    emit(eventName: string, payload: unknown) {
      for (const handler of listeners.get(eventName) ?? []) handler(payload)
    },
    reset() {
      listeners.clear()
      this.requestFromDesktop.mockReset()
      this.requestFromDesktop.mockResolvedValue(undefined)
    },
  }
})

vi.mock('../desktop/client', () => ({
  isDesktopRuntime: desktopMock.isDesktopRuntime,
  requestFromDesktop: desktopMock.requestFromDesktop,
  listenDesktopEvent: desktopMock.listenDesktopEvent,
}))

beforeEach(() => desktopMock.reset())

const STREAM_STATE = {
  claudeSessionId: null,
  status: 'ready',
  turnInFlight: false,
  pendingToolRequests: [],
  backgroundTaskIds: [],
} as const

function mockEnsure(options?: {
  streamId?: string
  replay?: unknown[]
  pendingToolRequests?: unknown[]
}) {
  desktopMock.requestFromDesktop.mockImplementation(async (method) =>
    method === 'claudeSessionQueryEnsure'
      ? {
          streamId: options?.streamId ?? 'stream-1',
          state: {
            ...STREAM_STATE,
            ...(options?.pendingToolRequests?.length
              ? { pendingToolRequests: options.pendingToolRequests }
              : {}),
          },
          replay: options?.replay ?? [],
        }
      : undefined,
  )
  return options?.streamId ?? 'stream-1'
}

describe('Claude client protocol', () => {
  it('ensures the session query and replays buffered frames before live output', async () => {
    mockEnsure({
      replay: [{ type: 'assistant', message: { content: [{ type: 'text', text: 'replay' }] } }],
    })
    const stream = claude.openSessionStream({ sessionId: 'session-1', options: {} })

    const first = await stream.next()
    expect(first).toMatchObject({
      value: { message: { content: [{ text: 'replay' }] } },
    })
    expect(desktopMock.requestFromDesktop).toHaveBeenCalledWith('claudeSessionQueryEnsure', {
      sessionId: 'session-1',
      options: {},
    })

    const live = stream.next()
    desktopMock.emit('claude-output', {
      streamId: 'stream-1',
      message: { type: 'assistant', message: { content: [{ type: 'text', text: 'live' }] } },
    })
    await expect(live).resolves.toMatchObject({
      value: { message: { content: [{ text: 'live' }] } },
    })
    stream.detach()
  })

  it('ignores frames addressed to other streams', async () => {
    mockEnsure()
    const stream = claude.openSessionStream({ sessionId: 'session-1', options: {} })
    await vi.waitFor(() => expect(stream.streamId).toBe('stream-1'))

    const live = stream.next()
    desktopMock.emit('claude-output', {
      streamId: 'other-stream',
      message: { type: 'assistant', message: { content: [{ type: 'text', text: 'elsewhere' }] } },
    })
    desktopMock.emit('claude-output', {
      streamId: 'stream-1',
      message: { type: 'assistant', message: { content: [{ type: 'text', text: 'mine' }] } },
    })
    await expect(live).resolves.toMatchObject({
      value: { message: { content: [{ text: 'mine' }] } },
    })
    stream.detach()
  })

  it('routes control commands with the attached stream id', async () => {
    mockEnsure({ streamId: 'stream-9' })
    const stream = claude.openSessionStream({ sessionId: 'session-1', options: {} })
    await vi.waitFor(() => expect(stream.streamId).toBe('stream-9'))
    await stream.setModel('opus')

    expect(desktopMock.requestFromDesktop).toHaveBeenCalledWith('claudeQueryControl', {
      streamId: 'stream-9',
      command: 'setModel',
      params: ['opus'],
    })
    stream.detach()
  })

  it('routes permission requests and answers with the attached stream id', async () => {
    const request = { kind: 'permission', toolUseId: 'tool-1', toolName: 'Write', input: {} }
    mockEnsure({ pendingToolRequests: [request] })
    const stream = claude.openSessionStream({ sessionId: 'session-1', options: {} })
    const handler = vi.fn()
    stream.subscribeToolRequests(handler)
    await vi.waitFor(() => expect(stream.streamId).toBe('stream-1'))

    // Requests already pending at attach time still reach the subscriber.
    expect(handler).toHaveBeenCalledWith(request)
    await stream.respondToolRequest('tool-1', { behavior: 'allow' })
    expect(desktopMock.requestFromDesktop).toHaveBeenCalledWith('claudeRespondToolRequest', {
      streamId: 'stream-1',
      toolUseId: 'tool-1',
      result: { behavior: 'allow' },
    })
    stream.detach()
  })

  it('dies with the streamed error message and stack', async () => {
    mockEnsure()
    const stream = claude.openSessionStream({ sessionId: 'session-1', options: {} })
    await vi.waitFor(() => expect(stream.streamId).toBe('stream-1'))

    const next = stream.next()
    desktopMock.emit('claude-error', {
      streamId: 'stream-1',
      message: 'model unavailable',
      stack: 'Error: model unavailable\n    at streamQuery (/app/runner.ts:42:7)',
    })
    await expect(next).rejects.toMatchObject({
      message: 'model unavailable',
      stack: 'Error: model unavailable\n    at streamQuery (/app/runner.ts:42:7)',
    })
    expect(stream.getState().status).toBe('dead')
  })

  it('detach stops consuming without touching the resident query', async () => {
    mockEnsure()
    const stream = claude.openSessionStream({ sessionId: 'session-1', options: {} })
    await vi.waitFor(() => expect(stream.streamId).toBe('stream-1'))
    stream.detach()

    const calls = desktopMock.requestFromDesktop.mock.calls.length
    desktopMock.emit('claude-output', {
      streamId: 'stream-1',
      message: { type: 'assistant', message: { content: [{ type: 'text', text: 'ignored' }] } },
    })
    expect(desktopMock.requestFromDesktop.mock.calls.length).toBe(calls)
    await expect(stream.next()).resolves.toMatchObject({ done: true })
  })
})
