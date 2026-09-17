import { describe, expect, it, vi } from 'vitest'

import { createSessionContextStore } from './context-store'

const context = {
  claudeSessionId: 'claude-session',
  projectId: 'project',
  projectPath: '/tmp/project',
  isHomeMode: false,
  isMockProject: false,
}

describe('session context store', () => {
  it('does not notify subscribers when the context is unchanged', () => {
    const store = createSessionContextStore('session', context)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.getState().syncContext({ ...context })

    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('notifies subscribers when a context value changes', () => {
    const store = createSessionContextStore('session', context)
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.getState().syncContext({ ...context, claudeSessionId: 'new-session' })

    expect(listener).toHaveBeenCalledOnce()
    expect(store.getState().claudeSessionId).toBe('new-session')
    unsubscribe()
  })
})
