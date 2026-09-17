import type { AppAppearancePreferences } from '@/shared/rpc'

import type { WindowFrame } from './window-state'

type MainWindowReadyTarget = {
  maximize: () => unknown
  show: () => unknown
  once: (name: 'ready-to-show', handler: () => void) => unknown
}

type MainWindowMaximizeTarget = {
  isMaximized: () => boolean
  maximize: () => unknown
  unmaximize: () => unknown
}

/**
 * Builds the Electron BrowserWindow options:
 * hidden until the themed document is ready, macOS hidden-inset title bar with
 * the traffic lights nudged into the padded corner, restored frame position.
 */
export function createMainWindowOptions(
  preload: string,
  frame: WindowFrame,
  appearance: AppAppearancePreferences,
) {
  const options: {
    title: string
    show: boolean
    x?: number
    y?: number
    width: number
    height: number
    titleBarStyle?: 'hiddenInset'
    trafficLightPosition?: { x: number; y: number }
    webPreferences: {
      preload: string
      sandbox: boolean
      additionalArguments: string[]
    }
  } = {
    title: 'Clotho',
    show: false,
    width: frame.width,
    height: frame.height,
    webPreferences: {
      preload,
      // The preload applies the persisted startup theme before first paint,
      // which requires evaluating the generated theme script in the renderer.
      sandbox: false,
      additionalArguments: [`--clotho-appearance=${encodeStartupAppearanceArgument(appearance)}`],
    },
  }

  if (frame.x !== undefined) options.x = frame.x
  if (frame.y !== undefined) options.y = frame.y
  if (process.platform === 'darwin') {
    options.titleBarStyle = 'hiddenInset'
    options.trafficLightPosition = { x: 6, y: 6 }
  }

  return options
}

/** Encodes a preload argument payload (base64 survives Chromium command-line parsing). */
export function encodeStartupAppearanceArgument(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

export function decodeStartupAppearanceArgument<T>(encoded: string): T | undefined {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T
  } catch {
    return undefined
  }
}

export function showMainWindowWhenReady(mainWindow: MainWindowReadyTarget, isMaximized = false) {
  mainWindow.once('ready-to-show', () => {
    if (isMaximized) mainWindow.maximize()
    mainWindow.show()
  })
}

export function toggleMainWindowMaximize(mainWindow: MainWindowMaximizeTarget) {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
}
