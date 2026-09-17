import { contextBridge, ipcRenderer } from 'electron'

import type { AppAppearancePreferences } from '@/shared/rpc'

import { createStartupThemePreload } from '../main/startup-theme'
import { decodeStartupAppearanceArgument } from '../main/window-options'

const REQUEST_CHANNEL_PREFIX = 'clotho:request:'
const MESSAGE_CHANNEL_PREFIX = 'clotho:message:'
const APPEARANCE_ARGUMENT_PREFIX = '--clotho-appearance='

// Apply the persisted startup theme before any page script runs so the first
// paint already uses the configured palette; the appearance payload is passed
// by the main process.
const appearanceArgument = process.argv.find((argument) =>
  argument.startsWith(APPEARANCE_ARGUMENT_PREFIX),
)
if (appearanceArgument) {
  const appearance = decodeStartupAppearanceArgument<AppAppearancePreferences>(
    appearanceArgument.slice(APPEARANCE_ARGUMENT_PREFIX.length),
  )
  if (appearance) {
    new Function(createStartupThemePreload(appearance))()
  }
}

contextBridge.exposeInMainWorld('clotho', {
  invoke(method: string, params: unknown) {
    return ipcRenderer.invoke(REQUEST_CHANNEL_PREFIX + method, params)
  },
  send(method: string, payload: unknown) {
    ipcRenderer.send(MESSAGE_CHANNEL_PREFIX + method, payload)
  },
  onPushMessage(name: string, handler: (payload: unknown) => void) {
    const listener = (_event: unknown, payload: unknown) => handler(payload)
    ipcRenderer.on(MESSAGE_CHANNEL_PREFIX + name, listener)
    return () => {
      ipcRenderer.removeListener(MESSAGE_CHANNEL_PREFIX + name, listener)
    }
  },
})
