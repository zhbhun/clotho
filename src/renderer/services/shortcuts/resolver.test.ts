import { describe, expect, test, vi } from 'vitest'

import type { CommandCatalog } from '@/shared/shortcuts'

import { createCommandRegistry } from './registry'
import { findShortcutConflicts, resolveActiveBindings } from './resolver'

const catalog: CommandCatalog = {
  'workbench.new': {
    title: 'New session',
    scope: 'workbench',
    defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
  },
  'workbench.sidebar.new': {
    title: 'New sidebar item',
    scope: 'workbench.sidebar',
    defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
  },
  'workbench.always': {
    title: 'Always available',
    scope: '*',
    defaultBindings: [{ modifiers: ['primary'], key: 'p' }],
  },
}

function registry(disabled?: string) {
  const next = createCommandRegistry(catalog)
  for (const commandId of Object.keys(catalog)) {
    const registration = next.register(commandId, vi.fn())
    if (commandId === disabled) registration.setEnabled(false)
  }
  return next
}

describe('shortcut resolver', () => {
  test('uses the deepest active scope, but falls back to an enabled ancestor', () => {
    const active = (disabled?: string) =>
      resolveActiveBindings({
        catalog,
        currentScope: 'workbench.sidebar',
        isCapturing: false,
        overrides: {},
        platform: 'mac',
        registry: registry(disabled),
      }).map(({ commandId }) => commandId)

    expect(active()).toEqual(['workbench.sidebar.new', 'workbench.always'])
    expect(active('workbench.sidebar.new')).toContain('workbench.new')
  })

  test('does not resolve commands while recording a shortcut', () => {
    expect(
      resolveActiveBindings({
        catalog,
        currentScope: 'workbench',
        isCapturing: true,
        overrides: {},
        platform: 'mac',
        registry: registry(),
      }),
    ).toEqual([])
  })

  test('distinguishes a shadowing ancestor from a hard any-scope conflict', () => {
    expect(
      findShortcutConflicts({
        binding: { modifiers: ['primary'], key: 'n' },
        catalog,
        commandId: 'workbench.sidebar.new',
        overrides: {},
        platform: 'mac',
      }),
    ).toEqual([{ commandId: 'workbench.new', type: 'shadow' }])
    expect(
      findShortcutConflicts({
        binding: { modifiers: ['primary'], key: 'p' },
        catalog,
        commandId: 'workbench.new',
        overrides: {},
        platform: 'mac',
      }),
    ).toEqual([{ commandId: 'workbench.always', type: 'hard' }])
  })
})
