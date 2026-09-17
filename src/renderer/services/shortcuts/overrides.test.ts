import { describe, expect, test, vi } from 'vitest'

import type { ShortcutOverrides } from '@/shared/shortcuts'

import { createShortcutOverridesStore } from './overrides'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('shortcut overrides store', () => {
  test('waits for the initial snapshot before persisting a mutation', async () => {
    const loaded = deferred<ShortcutOverrides>()
    const set = vi.fn(async () => ({ 'workbench.new': [] }))
    const store = createShortcutOverridesStore({
      load: vi.fn(() => loaded.promise),
      reset: vi.fn(),
      set,
    })

    const mutation = store.set('workbench.new', [])
    expect(set).not.toHaveBeenCalled()
    loaded.resolve({})
    await mutation

    expect(store.getSnapshot().overrides).toEqual({ 'workbench.new': [] })
  })

  test('keeps persisted state intact and exposes an error when a mutation fails', async () => {
    const store = createShortcutOverridesStore({
      load: vi.fn(async () => ({})),
      reset: vi.fn(),
      set: vi.fn(async () => {
        throw new Error('disk full')
      }),
    })
    await store.initialize()

    await expect(store.set('workbench.new', [])).rejects.toThrow('disk full')
    expect(store.getSnapshot()).toMatchObject({ error: 'disk full', overrides: {} })
  })

  test('allows initialization to be retried after a persisted snapshot load fails', async () => {
    let loadAttempts = 0
    const store = createShortcutOverridesStore({
      load: vi.fn(async () => {
        loadAttempts += 1
        if (loadAttempts === 1) throw new Error('unavailable')
        return { 'workbench.new': [] }
      }),
      reset: vi.fn(),
      set: vi.fn(),
    })

    await store.initialize()
    expect(store.getSnapshot()).toMatchObject({
      isLoaded: true,
      error: 'unavailable',
      overrides: {},
    })

    await store.initialize()
    expect(store.getSnapshot()).toEqual({
      isLoaded: true,
      error: null,
      overrides: { 'workbench.new': [] },
    })
  })
})
