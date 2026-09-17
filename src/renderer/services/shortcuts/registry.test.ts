import { describe, expect, test, vi } from 'vitest'

import type { CommandCatalog } from '@/shared/shortcuts'

import { createCommandRegistry } from './registry'

const catalog: CommandCatalog = {
  'workbench.new': { title: 'New session', scope: 'workbench', defaultBindings: [] },
}

describe('command registry', () => {
  test('rejects unknown and duplicate live command handlers', () => {
    const registry = createCommandRegistry(catalog)
    expect(() => registry.register('toString', vi.fn())).toThrow('Unknown command: toString')

    registry.register('workbench.new', vi.fn())
    expect(() => registry.register('workbench.new', vi.fn())).toThrow(
      'Command already registered: workbench.new',
    )
  })
})
