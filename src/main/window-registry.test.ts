// @vitest-environment node
import { expect, test } from 'vitest'

import { createWindowRegistry } from './window-registry'

test('allows many free windows but one project window per project', () => {
  const registry = createWindowRegistry()

  expect(registry.register({ id: 'free-1', kind: 'free', webContentsId: 1 })).toBe(true)
  expect(registry.register({ id: 'free-2', kind: 'free', webContentsId: 2 })).toBe(true)
  expect(registry.register({ id: 'p1', kind: 'project', projectId: 'p', webContentsId: 3 })).toBe(
    true,
  )
  expect(registry.register({ id: 'p2', kind: 'project', projectId: 'p', webContentsId: 4 })).toBe(
    false,
  )
  expect(registry.register({ id: 'bad', kind: 'project', webContentsId: 5 })).toBe(false)

  expect(registry.freeWindows().map((window) => window.id)).toEqual(['free-1', 'free-2'])
  expect(registry.projectFor('p')?.id).toBe('p1')
  expect(registry.projectFor('q')).toBeUndefined()
  expect(registry.byWebContents(3)?.id).toBe('p1')
  expect(registry.pinnedProjectIds()).toEqual(['p'])
})

test('rebinding and unregistering release the project for another window', () => {
  const registry = createWindowRegistry()
  registry.register({ id: 'p1', kind: 'project', projectId: 'p', webContentsId: 1 })
  registry.register({ id: 'p2', kind: 'project', projectId: 'q', webContentsId: 2 })

  expect(registry.rebind('p1', 'q')).toBe(false)
  expect(registry.rebind('p1', 'p')).toBe(true)
  expect(registry.rebind('p1', 'r')).toBe(true)
  expect(registry.projectFor('p')).toBeUndefined()
  expect(registry.projectFor('r')?.id).toBe('p1')

  expect(registry.unregister('p2')?.projectId).toBe('q')
  expect(registry.register({ id: 'p3', kind: 'project', projectId: 'q', webContentsId: 3 })).toBe(
    true,
  )
  expect(registry.pinnedProjectIds().sort()).toEqual(['q', 'r'])
})

test('rebinding rejects a free window', () => {
  const registry = createWindowRegistry()
  registry.register({ id: 'free-1', kind: 'free', webContentsId: 1 })

  expect(registry.rebind('free-1', 'p')).toBe(false)
  expect(registry.projectFor('p')).toBeUndefined()
})
