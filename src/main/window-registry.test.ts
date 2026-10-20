// @vitest-environment node
import { expect, test } from 'vitest'

import { createWindowRegistry } from './window-registry'

test('allows one main window and one focused window per project', () => {
  const registry = createWindowRegistry()

  expect(registry.register({ id: 'main', kind: 'main', webContentsId: 1 })).toBe(true)
  expect(registry.register({ id: 'main-2', kind: 'main', webContentsId: 2 })).toBe(false)
  expect(registry.register({ id: 'f1', kind: 'focused', projectId: 'p', webContentsId: 3 })).toBe(
    true,
  )
  expect(registry.register({ id: 'f2', kind: 'focused', projectId: 'p', webContentsId: 4 })).toBe(
    false,
  )
  expect(registry.register({ id: 'f3', kind: 'focused', webContentsId: 5 })).toBe(false)

  expect(registry.main()?.id).toBe('main')
  expect(registry.focusedFor('p')?.id).toBe('f1')
  expect(registry.byWebContents(3)?.id).toBe('f1')
  expect(registry.focusedProjectIds()).toEqual(['p'])
})

test('rebinding and unregistering release the project for another window', () => {
  const registry = createWindowRegistry()
  registry.register({ id: 'f1', kind: 'focused', projectId: 'p', webContentsId: 1 })
  registry.register({ id: 'f2', kind: 'focused', projectId: 'q', webContentsId: 2 })

  expect(registry.rebind('f1', 'q')).toBe(false)
  expect(registry.rebind('f1', 'p')).toBe(true)
  expect(registry.rebind('f1', 'r')).toBe(true)
  expect(registry.focusedFor('p')).toBeUndefined()
  expect(registry.focusedFor('r')?.id).toBe('f1')

  expect(registry.unregister('f2')?.projectId).toBe('q')
  expect(registry.register({ id: 'f3', kind: 'focused', projectId: 'q', webContentsId: 3 })).toBe(
    true,
  )
  expect(registry.focusedProjectIds().sort()).toEqual(['q', 'r'])
})
