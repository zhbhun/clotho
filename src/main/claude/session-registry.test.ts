// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { sessionRecycleGate } from './session-registry'

vi.mock('../logging/runtime', () => ({ getLogger: () => ({ info: vi.fn() }) }))

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
