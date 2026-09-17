import { describe, expect, test, vi } from 'vitest'

import type { CommandCatalog, ShortcutOverrides } from '@/shared/shortcuts'

import { createShortcutRuntime } from './runtime'

const catalog: CommandCatalog = {
  'workbench.new': { title: 'New session', scope: 'workbench', defaultBindings: [] },
}

describe('shortcut runtime', () => {
  test('allows stale persisted overrides to be removed after a command is deleted', async () => {
    let persisted: ShortcutOverrides = { unknown: [{ modifiers: ['primary'], key: 'n' }] }
    const runtime = createShortcutRuntime({
      catalog,
      client: {
        load: vi.fn(async () => persisted),
        reset: vi.fn(async (commandId) => {
          const next = { ...persisted }
          delete next[commandId]
          persisted = next
          return next
        }),
        set: vi.fn(),
      },
    })

    await expect(runtime.overrides.reset('unknown')).resolves.toEqual({})
  })

  test('rejects invalid shortcut bindings before persisting them', async () => {
    const set = vi.fn(async () => ({}))
    const runtime = createShortcutRuntime({
      catalog,
      client: { load: vi.fn(async () => ({})), reset: vi.fn(), set },
    })

    await expect(
      runtime.overrides.set('workbench.new', [{ modifiers: [], key: 'x' }]),
    ).rejects.toThrow('Invalid shortcut binding: bare-printable')
    expect(set).not.toHaveBeenCalled()
  })

  test('rejects conflicting defaults before the runtime can activate them', () => {
    expect(() =>
      createShortcutRuntime({
        catalog: {
          first: {
            title: 'First',
            scope: 'workbench',
            defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
          },
          second: {
            title: 'Second',
            scope: 'workbench',
            defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
          },
        },
        client: { load: vi.fn(), reset: vi.fn(), set: vi.fn() },
        platform: 'mac',
      }),
    ).toThrow('Default keybinding conflict between first and second')
  })
})
