// @vitest-environment node
import type { WebContents } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { attachExternalNavigation, resolveNavigationDisposition } from './external-navigation'
import { DEV_SERVER_URL } from './main-view-url'

const devServerTarget = { kind: 'dev-server', url: DEV_SERVER_URL } as const
const bundledTarget = {
  kind: 'bundled',
  filePath: '/mock/main/../renderer/main_window/index.html',
} as const

function captureWebContents(currentUrl = '') {
  let navigateListener: ((event: { preventDefault: () => void }, url: string) => void) | null = null
  let windowOpenHandler: ((details: { url: string }) => { action: 'deny' }) | null = null
  const webContents = {
    getURL: () => currentUrl,
    on: (
      _channel: string,
      listener: (event: { preventDefault: () => void }, url: string) => void,
    ) => {
      navigateListener = listener
    },
    setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' }) => {
      windowOpenHandler = handler
    },
  }
  return {
    webContents: webContents as unknown as WebContents,
    navigate(url: string) {
      if (!navigateListener) throw new Error('will-navigate listener not attached')
      const event = { preventDefault: vi.fn() }
      navigateListener(event, url)
      return event.preventDefault.mock.calls.length > 0
    },
    openWindow(url: string) {
      if (!windowOpenHandler) throw new Error('window open handler not attached')
      return windowOpenHandler({ url })
    },
  }
}

describe('resolveNavigationDisposition', () => {
  it('allows reloading the current location but not other dev-server paths', () => {
    const currentUrl = `${DEV_SERVER_URL}/`
    expect(resolveNavigationDisposition(currentUrl, devServerTarget, currentUrl)).toBe('allow')
    expect(
      resolveNavigationDisposition(
        `${DEV_SERVER_URL}/packages/editor/src/chatPreviewStore.ts`,
        devServerTarget,
        currentUrl,
      ),
    ).toBe('block')
  })

  it('opens http(s) and mailto links externally', () => {
    expect(resolveNavigationDisposition('https://example.com/page', devServerTarget)).toBe(
      'open-external',
    )
    expect(resolveNavigationDisposition('https://example.com/page', bundledTarget)).toBe(
      'open-external',
    )
    expect(resolveNavigationDisposition('mailto:someone@example.com', bundledTarget)).toBe(
      'open-external',
    )
  })

  it('blocks file links that would resolve next to the bundle', () => {
    expect(
      resolveNavigationDisposition('file:///mock/renderer/main_window/foo.ts', bundledTarget),
    ).toBe('block')
    expect(resolveNavigationDisposition('file:///etc/passwd', devServerTarget)).toBe('block')
  })

  it('blocks unknown schemes and malformed urls', () => {
    expect(resolveNavigationDisposition('vscode://file/whatever', bundledTarget)).toBe('block')
    expect(resolveNavigationDisposition('not a url', bundledTarget)).toBe('block')
  })
})

describe('attachExternalNavigation', () => {
  it('blocks in-window navigation and opens external links with the system handler', () => {
    const openExternal = vi.fn()
    const captured = captureWebContents('file:///mock/renderer/main_window/index.html')
    attachExternalNavigation(captured.webContents, bundledTarget, openExternal)

    expect(captured.navigate('https://example.com')).toBe(true)
    expect(openExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('lets the current location reload without opening anything', () => {
    const openExternal = vi.fn()
    const captured = captureWebContents(`${DEV_SERVER_URL}/`)
    attachExternalNavigation(captured.webContents, devServerTarget, openExternal)

    expect(captured.navigate(`${DEV_SERVER_URL}/`)).toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('blocks a relative dev link from refreshing the app', () => {
    const openExternal = vi.fn()
    const captured = captureWebContents(`${DEV_SERVER_URL}/`)
    attachExternalNavigation(captured.webContents, devServerTarget, openExternal)

    expect(captured.navigate(`${DEV_SERVER_URL}/chatPreviewStore.ts`)).toBe(true)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it('denies spawned windows and routes external urls to the system handler', () => {
    const openExternal = vi.fn()
    const captured = captureWebContents()
    attachExternalNavigation(captured.webContents, bundledTarget, openExternal)

    expect(captured.openWindow('https://example.com')).toEqual({ action: 'deny' })
    expect(openExternal).toHaveBeenCalledWith('https://example.com')

    openExternal.mockClear()
    expect(captured.openWindow('file:///etc/passwd')).toEqual({ action: 'deny' })
    expect(openExternal).not.toHaveBeenCalled()
  })
})
