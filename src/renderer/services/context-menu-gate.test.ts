import { afterEach, describe, expect, it } from 'vitest'

import { installContextMenuGate } from './context-menu-gate'

function rightClick(target: Element) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('installContextMenuGate', () => {
  let cleanup: (() => void) | undefined

  afterEach(() => {
    cleanup?.()
    document.body.innerHTML = ''
  })

  it('suppresses the production menu only outside editable and selected content', () => {
    cleanup = installContextMenuGate({ isDev: false, getSelectionText: () => '' })
    const plain = document.createElement('div')
    const input = document.createElement('input')
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    document.body.append(plain, input, editable)

    expect(rightClick(plain).defaultPrevented).toBe(true)
    expect(rightClick(input).defaultPrevented).toBe(false)
    expect(rightClick(editable).defaultPrevented).toBe(false)
  })

  it('preserves the browser menu for a text selection or in development', () => {
    const area = document.createElement('div')
    document.body.append(area)

    cleanup = installContextMenuGate({ isDev: false, getSelectionText: () => 'selected text' })
    expect(rightClick(area).defaultPrevented).toBe(false)
    cleanup()

    cleanup = installContextMenuGate({ isDev: true, getSelectionText: () => '' })
    expect(rightClick(area).defaultPrevented).toBe(false)
  })
})
