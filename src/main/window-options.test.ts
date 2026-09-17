// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DEFAULT_APP_PREFERENCES } from './claude/settings'
import {
  createMainWindowOptions,
  decodeStartupAppearanceArgument,
  encodeStartupAppearanceArgument,
  showMainWindowWhenReady,
  toggleMainWindowMaximize,
} from './window-options'

const FRAME = { x: 160, y: 100, width: 1280, height: 800 }

describe('main window startup visibility', () => {
  it('keeps the window hidden until the themed document is ready', () => {
    let handleReady: (() => void) | undefined
    let isVisible = false
    const mainWindow = {
      once(name: 'ready-to-show', handler: () => void) {
        expect(name).toBe('ready-to-show')
        handleReady = handler
      },
      maximize() {},
      show() {
        isVisible = true
      },
    }

    const options = createMainWindowOptions('preload', FRAME, DEFAULT_APP_PREFERENCES.appearance)
    showMainWindowWhenReady(mainWindow)

    expect(options.show).toBe(false)
    expect(options.width).toBe(FRAME.width)
    expect(options.height).toBe(FRAME.height)
    expect(options.x).toBe(FRAME.x)
    expect(options.y).toBe(FRAME.y)
    expect(isVisible).toBe(false)

    handleReady?.()

    expect(isVisible).toBe(true)
  })

  it('restores maximized state before showing the ready window', () => {
    let handleReady: (() => void) | undefined
    const actions: string[] = []
    const mainWindow = {
      once(_name: 'ready-to-show', handler: () => void) {
        handleReady = handler
      },
      maximize() {
        actions.push('maximize')
      },
      show() {
        actions.push('show')
      },
    }

    showMainWindowWhenReady(mainWindow, true)
    handleReady?.()

    expect(actions).toEqual(['maximize', 'show'])
  })
})

describe('main window maximize toggle', () => {
  it('maximizes a normal window', () => {
    const actions: string[] = []
    const mainWindow = {
      isMaximized: () => false,
      maximize: () => actions.push('maximize'),
      unmaximize: () => actions.push('unmaximize'),
    }

    toggleMainWindowMaximize(mainWindow)

    expect(actions).toEqual(['maximize'])
  })

  it('restores an already maximized window', () => {
    const actions: string[] = []
    const mainWindow = {
      isMaximized: () => true,
      maximize: () => actions.push('maximize'),
      unmaximize: () => actions.push('unmaximize'),
    }

    toggleMainWindowMaximize(mainWindow)

    expect(actions).toEqual(['unmaximize'])
  })
})

describe('startup appearance preload argument', () => {
  it('round-trips the appearance preferences', () => {
    const encoded = encodeStartupAppearanceArgument(DEFAULT_APP_PREFERENCES.appearance)

    expect(decodeStartupAppearanceArgument(encoded)).toEqual(DEFAULT_APP_PREFERENCES.appearance)
  })

  it('rejects corrupted payloads', () => {
    expect(decodeStartupAppearanceArgument('not-base64!')).toBeUndefined()
  })
})
