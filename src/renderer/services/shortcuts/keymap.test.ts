import { describe, expect, test } from 'vitest'

import type { CommandCatalog } from '@/shared/shortcuts'

import { getEffectiveBindings } from './keymap'

const catalog: CommandCatalog = {
  'workbench.new': {
    title: 'New session',
    scope: 'workbench',
    defaultBindings: [{ modifiers: ['primary'], key: 'n' }],
  },
}

describe('effective shortcut keymap', () => {
  test('treats an empty user override as an explicitly unassigned shortcut', () => {
    expect(getEffectiveBindings('workbench.new', catalog, { 'workbench.new': [] })).toEqual([])
  })
})
