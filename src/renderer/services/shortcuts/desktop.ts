import type { CommandId, ShortcutBinding } from '@/shared/shortcuts'

import { isDesktopRuntime, requestFromDesktop } from '../desktop/client'
import type { ShortcutOverridesClient } from './overrides'

function requireDesktopRuntime() {
  if (!isDesktopRuntime())
    throw new Error('Shortcut settings are only available in the desktop app')
}

export const desktopShortcutOverridesClient: ShortcutOverridesClient = {
  load() {
    if (!isDesktopRuntime()) return Promise.resolve({})
    return requestFromDesktop('shortcutGetOverrides', {})
  },
  reset(commandId: CommandId) {
    requireDesktopRuntime()
    return requestFromDesktop('shortcutResetOverride', { commandId })
  },
  set(commandId: CommandId, bindings: ShortcutBinding[]) {
    requireDesktopRuntime()
    return requestFromDesktop('shortcutSetOverride', { commandId, bindings })
  },
}
