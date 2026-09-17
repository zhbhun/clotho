import { beforeEach, describe, expect, it, vi } from 'vitest'

import { claude } from './claude'

const desktopMock = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>()
  return {
    isDesktopRuntime: vi.fn(() => true),
    requestFromDesktop: vi.fn(async () => undefined),
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

describe('Claude client protocol', () => {
  it('assigns one client UUID to the query and its desktop start request', () => {
    const query = claude.query({ prompt: 'hello' })
    const [, start] = desktopMock.requestFromDesktop.mock.calls[0] as unknown as [
      string,
      { userMessageUuid: string },
    ]

    expect(start.userMessageUuid).toBe(query.userMessageUuid)
    expect(start.userMessageUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    query.close()
  })

  it('assigns a fresh session ID before init and sends it to the SDK', () => {
    const query = claude.query({ prompt: 'hello' })
    const [, start] = desktopMock.requestFromDesktop.mock.calls[0] as unknown as [
      string,
      { options: { sessionId: string } },
    ]
    expect(start.options.sessionId).toMatch(/^[0-9a-f-]{36}$/i)
    expect(query).toMatchObject({ sessionId: start.options.sessionId })
    query.close()
  })

  it('exposes the supplied session ID and waits for the desktop close acknowledgment', async () => {
    const sessionId = '053b14f1-084f-45ac-b983-3f0f8ecc513d'
    const query = claude.query({ prompt: 'hello again', options: { sessionId } })
    expect(query.sessionId).toBe(sessionId)
    expect(desktopMock.requestFromDesktop).toHaveBeenCalledWith(
      'claudeQueryStart',
      expect.objectContaining({ options: { sessionId } }),
    )
    let resolveClose!: () => void
    const closing = new Promise<undefined>((resolve) => {
      resolveClose = () => resolve(undefined)
    })
    desktopMock.requestFromDesktop.mockReturnValueOnce(closing)
    expect(query.close()).toBe(closing)
    expect(query.close()).toBe(closing)
    resolveClose()
    await closing
  })

  it('routes concurrent output and control commands to their owning query', async () => {
    const first = claude.query({ prompt: 'first' })
    const second = claude.query({ prompt: 'second' })
    const [, firstStart] = desktopMock.requestFromDesktop.mock.calls[0] as unknown as [
      string,
      { streamId: string },
    ]
    const [, secondStart] = desktopMock.requestFromDesktop.mock.calls[1] as unknown as [
      string,
      { streamId: string },
    ]

    const firstNext = first.next()
    const secondNext = second.next()
    desktopMock.emit('claude-output', {
      streamId: secondStart.streamId,
      message: { type: 'assistant', message: { content: [{ type: 'text', text: 'two' }] } },
    })
    desktopMock.emit('claude-output', {
      streamId: firstStart.streamId,
      message: { type: 'assistant', message: { content: [{ type: 'text', text: 'one' }] } },
    })

    await expect(firstNext).resolves.toMatchObject({
      value: { message: { content: [{ text: 'one' }] } },
    })
    await expect(secondNext).resolves.toMatchObject({
      value: { message: { content: [{ text: 'two' }] } },
    })
    await first.setModel('opus')
    expect(desktopMock.requestFromDesktop).toHaveBeenCalledWith('claudeQueryControl', {
      streamId: firstStart.streamId,
      command: 'setModel',
      params: ['opus'],
    })
    first.close()
    expect(desktopMock.requestFromDesktop).toHaveBeenCalledWith('claudeQueryClose', {
      streamId: firstStart.streamId,
    })
  })

  it('routes permission requests and stream errors without crossing query boundaries', async () => {
    const first = claude.query({ prompt: 'first' })
    const second = claude.query({ prompt: 'second' })
    const [, secondStart] = desktopMock.requestFromDesktop.mock.calls[1] as unknown as [
      string,
      { streamId: string },
    ]
    const firstHandler = vi.fn()
    const secondHandler = vi.fn()
    first.subscribeToolRequests(firstHandler)
    second.subscribeToolRequests(secondHandler)
    desktopMock.emit('claude-tool-request', {
      streamId: secondStart.streamId,
      request: { kind: 'permission', toolUseId: 'tool-1', toolName: 'Write', input: {} },
    })

    expect(firstHandler).not.toHaveBeenCalled()
    expect(secondHandler).toHaveBeenCalledOnce()
    await second.respondToolRequest('tool-1', { behavior: 'allow' })
    expect(desktopMock.requestFromDesktop).toHaveBeenCalledWith('claudeRespondToolRequest', {
      streamId: secondStart.streamId,
      toolUseId: 'tool-1',
      result: { behavior: 'allow' },
    })

    const next = second.next()
    desktopMock.emit('claude-error', {
      streamId: secondStart.streamId,
      message: 'model unavailable',
      stack: 'Error: model unavailable\n    at streamQuery (/app/runner.ts:42:7)',
    })
    await expect(next).rejects.toMatchObject({
      message: 'model unavailable',
      stack: 'Error: model unavailable\n    at streamQuery (/app/runner.ts:42:7)',
    })
  })
})
