// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSessionFollowManager } from './session-follow-manager'

const file = vi.hoisted(() => ({ content: '' }))

vi.mock('./workspace', () => ({
  claudeDir: () => '/Users/me/.claude',
  assertPathSegment: () => {},
}))
vi.mock('./projects', () => ({
  projectPathForId: async () => '/Users/me/project',
}))
vi.mock('./session-follower', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./session-follower')>()),
  createFileFollowReader: () => ({
    size: async () => new TextEncoder().encode(file.content).length,
    read: async (offset: number, length: number) => {
      const bytes = new TextEncoder().encode(file.content).slice(offset, offset + length)
      return { bytes, bytesRead: bytes.length }
    },
  }),
}))

const sessionId = 'same-session'
const oldHistory = `${JSON.stringify({ type: 'user', message: { content: 'old long prompt' } })}\n`
const freshHistory = `${JSON.stringify({ type: 'user', message: { content: 'hi' } })}\n`

function createSetup() {
  const events = { onUpdate: vi.fn(), onState: vi.fn(), onReset: vi.fn() }
  return { events, manager: createSessionFollowManager(events) }
}

describe('session follow offsets', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    file.content = oldHistory
  })
  afterEach(() => vi.useRealTimers())

  it('detects history shortened by another client while the follower was inactive', async () => {
    const { events, manager } = createSetup()
    await manager.start('project', sessionId)
    manager.stop(sessionId)
    file.content = freshHistory

    await manager.start('project', sessionId)
    await vi.advanceTimersByTimeAsync(0)

    expect(events.onReset).toHaveBeenCalledExactlyOnceWith(sessionId)
    manager.stopAll()
  })

  it('forgets the old offset when Clotho recreates the same session log', async () => {
    const { events, manager } = createSetup()
    await manager.start('project', sessionId)
    manager.stop(sessionId)
    file.content = ''
    manager.reset(sessionId)
    file.content = freshHistory

    await manager.start('project', sessionId)
    await vi.advanceTimersByTimeAsync(0)

    expect(events.onReset).not.toHaveBeenCalled()
    expect(events.onUpdate).not.toHaveBeenCalled()
    manager.stopAll()
  })

  it('stops an active follower before clearing its offset and continues reading new lines', async () => {
    const { events, manager } = createSetup()
    await manager.start('project', sessionId)
    manager.reset(sessionId)
    file.content = freshHistory
    await vi.advanceTimersByTimeAsync(3000)
    expect(events.onReset).not.toHaveBeenCalled()

    await manager.start('project', sessionId)
    await vi.advanceTimersByTimeAsync(0)
    const reply = { type: 'assistant', message: { content: 'Hello', stop_reason: 'end_turn' } }
    file.content += `${JSON.stringify(reply)}\n`
    await vi.advanceTimersByTimeAsync(3000)

    expect(events.onReset).not.toHaveBeenCalled()
    expect(events.onUpdate).toHaveBeenCalledExactlyOnceWith(sessionId, [reply])
    manager.stopAll()
  })
})
