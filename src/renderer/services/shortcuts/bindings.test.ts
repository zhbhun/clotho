import { describe, expect, test } from 'vitest'

import { bindingSignature, eventMatchesShortcutBinding } from './bindings'

describe('shortcut bindings', () => {
  test('maps the logical primary modifier to each platform and requires an exact modifier set', () => {
    const primary = { modifiers: ['primary'] as const, key: 'n' }
    expect(bindingSignature(primary, 'windows')).toBe(
      bindingSignature({ modifiers: ['ctrl'], key: 'n' }, 'windows'),
    )
    expect(
      eventMatchesShortcutBinding(
        new KeyboardEvent('keydown', { key: 'n', metaKey: true }),
        { modifiers: ['primary', 'ctrl'], key: 'n' },
        'mac',
      ),
    ).toBe(false)
  })

  test('recognizes macOS Option shortcuts from their physical key', () => {
    expect(
      eventMatchesShortcutBinding(
        new KeyboardEvent('keydown', { altKey: true, code: 'KeyP', key: 'π', metaKey: true }),
        { modifiers: ['primary', 'alt'], key: 'p' },
        'mac',
      ),
    ).toBe(true)
  })
})
