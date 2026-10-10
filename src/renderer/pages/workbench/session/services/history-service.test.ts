import { afterEach, describe, expect, it, vi } from 'vitest'

import { createConversationStore } from '../stores/conversation-store'
import { HistoryService } from './history-service'

function createService() {
  const conversationStore = createConversationStore()
  const controller = { conversationStore, isDisposed: false }
  return { service: new HistoryService(controller as never), conversationStore }
}

function stubFrames() {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextId = 1
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextId++
    callbacks.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    callbacks.delete(id)
  })
  return {
    flush() {
      const pending = [...callbacks.values()]
      callbacks.clear()
      for (const callback of pending) callback(0)
    },
    get pendingCount() {
      return callbacks.size
    },
  }
}

function assistantLine(uuid: string) {
  return JSON.stringify({
    type: 'assistant',
    uuid,
    message: { role: 'assistant', content: [{ type: 'text', text: `reply ${uuid}` }] },
  })
}

describe('HistoryService', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('coalesces a burst of streamed lines into one notification per frame', () => {
    const frames = stubFrames()
    const { service, conversationStore } = createService()

    let notifications = 0
    const unsubscribe = conversationStore.subscribe(() => {
      notifications += 1
    })

    for (let index = 0; index < 40; index += 1) service.ingestLine(assistantLine(`a-${index}`))
    expect(notifications).toBe(0)
    expect(frames.pendingCount).toBe(1)

    frames.flush()
    expect(notifications).toBe(1)
    expect(service.messages()).toHaveLength(40)
    unsubscribe()
  })

  it('flushes turn transitions synchronously and supersedes the pending frame', () => {
    const frames = stubFrames()
    const { service, conversationStore } = createService()

    let notifications = 0
    const unsubscribe = conversationStore.subscribe(() => {
      notifications += 1
    })

    service.ingestLine(assistantLine('a-1'))
    expect(frames.pendingCount).toBe(1)

    service.commitUserMessage({ id: 'local-user-1', role: 'user', content: 'Hello' })
    // The commit's replaceMessages and markSent each notify.
    expect(notifications).toBe(2)
    expect(frames.pendingCount).toBe(0)

    frames.flush()
    expect(notifications).toBe(2)
    expect(service.messages()).toHaveLength(2)
    unsubscribe()
  })

  it('flushes the pending frame when the stream stops', () => {
    const frames = stubFrames()
    const conversationStore = createConversationStore()
    const controller = { conversationStore, isDisposed: false }
    const service = new HistoryService(controller as never)

    service.ingestLine(assistantLine('a-1'))
    expect(frames.pendingCount).toBe(1)

    service.ingestLine(assistantLine('a-2'))
    service.flushPendingPublish()
    expect(frames.pendingCount).toBe(0)
    expect(service.messages()).toHaveLength(2)
    expect(conversationStore.getState().messageIds).toHaveLength(2)
  })
})
