import { describe, expect, test } from 'vitest'

import { createShortcutCaptureManager, createShortcutScopeManager } from './scope'

describe('shortcut scopes', () => {
  test('keeps a nested React owner active when effects mount out of hierarchy order', () => {
    const scopes = createShortcutScopeManager()
    const parent = scopes.createOwner()
    const child = scopes.createOwner(parent)
    scopes.activate('workbench.session', child)
    scopes.activate('workbench', parent)

    expect(scopes.getCurrent()).toBe('workbench.session')
  })

  test('removes an exact activation without disturbing a newer nested scope', () => {
    const scopes = createShortcutScopeManager()
    const disposeWorkbench = scopes.activate('workbench')
    const disposeSidebar = scopes.activate('workbench.sidebar')
    disposeWorkbench()
    expect(scopes.getCurrent()).toBe('workbench.sidebar')
    disposeSidebar()
    expect(scopes.getCurrent()).toBeNull()
  })

  test('keeps capture active until the last recorder exits', () => {
    const capture = createShortcutCaptureManager()
    const first = capture.begin()
    const second = capture.begin()
    first()
    expect(capture.getSnapshot()).toBe(true)
    second()
    expect(capture.getSnapshot()).toBe(false)
  })
})
