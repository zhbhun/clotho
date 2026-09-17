import { describe, expect, test } from 'vitest'

import { interpretShortcutCapture } from './recorder'

describe('shortcut recorder', () => {
  test('rejects an unsafe bare printable key', () => {
    expect(interpretShortcutCapture(new KeyboardEvent('keydown', { key: 'n' }), 'mac')).toEqual({
      issue: 'bare-printable',
      type: 'invalid',
    })
  })

  test('records a macOS Option shortcut using its physical key', () => {
    expect(
      interpretShortcutCapture(
        new KeyboardEvent('keydown', { altKey: true, code: 'KeyP', key: 'π', metaKey: true }),
        'mac',
      ),
    ).toEqual({ binding: { modifiers: ['primary', 'alt'], key: 'p' }, type: 'binding' })
  })
})
