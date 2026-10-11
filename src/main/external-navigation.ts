import type { WebContents } from 'electron'

import type { MainViewTarget } from './main-view-url'

/**
 * Dispositions for a renderer-initiated navigation or window.open: let the app
 * load, hand the URL to the operating system, or do nothing.
 */
export type NavigationDisposition = 'allow' | 'open-external' | 'block'

/** Schemes safe to hand to the OS; everything else (file:, smb:, …) stays closed. */
const OPENABLE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export function resolveNavigationDisposition(
  url: string,
  target: MainViewTarget,
  currentUrl?: string,
): NavigationDisposition {
  // Reloading the current location (Vite full reloads) must go through.
  if (currentUrl && url === currentUrl) {
    return 'allow'
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'block'
  }

  // Other same-origin dev paths are stray relative markdown links; loading one
  // would swap the app for Vite's SPA fallback and look like a full refresh.
  if (target.kind === 'dev-server' && parsed.origin === new URL(target.url).origin) {
    return 'block'
  }
  // Packaged relative links resolve next to the bundle and lead nowhere useful.
  if (parsed.protocol === 'file:') {
    return 'block'
  }
  return OPENABLE_PROTOCOLS.has(parsed.protocol) ? 'open-external' : 'block'
}

/**
 * Keep the main window's webContents on the app: in-window navigation and
 * spawned windows are denied, and external links go to the system default
 * application instead.
 */
export function attachExternalNavigation(
  webContents: WebContents,
  target: MainViewTarget,
  openExternal: (url: string) => void,
) {
  webContents.on('will-navigate', (event, url) => {
    const disposition = resolveNavigationDisposition(url, target, webContents.getURL())
    if (disposition === 'allow') return
    event.preventDefault()
    if (disposition === 'open-external') openExternal(url)
  })
  webContents.setWindowOpenHandler(({ url }) => {
    if (resolveNavigationDisposition(url, target) === 'open-external') openExternal(url)
    return { action: 'deny' }
  })
}
