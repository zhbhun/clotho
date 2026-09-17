import { describe, expect, test, vi } from 'vitest'

import type { CommandCatalog } from '@/shared/shortcuts'

import { dispatchCommand } from './dispatcher'
import { createCommandRegistry } from './registry'

const catalog: CommandCatalog = {
  'workbench.new': { title: 'New session', scope: 'workbench', defaultBindings: [] },
}

describe('command dispatcher', () => {
  test('contains handler failures and reports them to the caller', async () => {
    const registry = createCommandRegistry(catalog)
    const onError = vi.fn()
    registry.register('workbench.new', () => {
      throw new Error('failed')
    })

    await expect(dispatchCommand(registry, 'workbench.new', onError)).resolves.toBe('failed')
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'workbench.new')
  })
})
