import { type ReactNode, createContext, useContext } from 'react'

import type { CommandCatalog, ShortcutPlatform } from '@/shared/shortcuts'

import { commandCatalog, validateCommandCatalog } from './catalog'
import { desktopShortcutOverridesClient } from './desktop'
import { type ShortcutOverridesClient, createShortcutOverridesStore } from './overrides'
import { createCommandRegistry } from './registry'
import { createShortcutCaptureManager, createShortcutScopeManager } from './scope'
import { getShortcutBindingIssue, isShortcutBinding } from './validation'

export function detectShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') return 'linux'
  const platform = navigator.userAgent.toLocaleLowerCase('en-US')
  if (platform.includes('mac')) return 'mac'
  if (platform.includes('win')) return 'windows'
  return 'linux'
}

export function createShortcutRuntime({
  catalog,
  client,
  platform = detectShortcutPlatform(),
}: {
  catalog: CommandCatalog
  client: ShortcutOverridesClient
  platform?: ShortcutPlatform
}) {
  validateCommandCatalog(catalog, platform)

  function assertKnownCommand(commandId: string) {
    if (!Object.hasOwn(catalog, commandId)) throw new Error(`Unknown command: ${commandId}`)
  }

  const whitelistClient: ShortcutOverridesClient = {
    async load() {
      const overrides = await client.load()
      return Object.fromEntries(
        Object.entries(overrides).map(([commandId, bindings]) => [
          commandId,
          bindings.filter(isShortcutBinding),
        ]),
      )
    },
    reset(commandId) {
      return client.reset(commandId)
    },
    set(commandId, bindings) {
      assertKnownCommand(commandId)
      for (const binding of bindings) {
        const issue = getShortcutBindingIssue(binding)
        if (issue) throw new Error(`Invalid shortcut binding: ${issue}`)
      }
      return client.set(commandId, bindings)
    },
  }

  return {
    capture: createShortcutCaptureManager(),
    catalog,
    overrides: createShortcutOverridesStore(whitelistClient),
    platform,
    registry: createCommandRegistry(catalog),
    scopes: createShortcutScopeManager(),
  }
}

export type ShortcutRuntime = ReturnType<typeof createShortcutRuntime>

export const shortcutRuntime = createShortcutRuntime({
  catalog: commandCatalog,
  client: desktopShortcutOverridesClient,
})

const ShortcutRuntimeContext = createContext<ShortcutRuntime | null>(null)

export function ShortcutRuntimeProvider({
  children,
  runtime,
}: {
  children: ReactNode
  runtime: ShortcutRuntime
}) {
  return <ShortcutRuntimeContext value={runtime}>{children}</ShortcutRuntimeContext>
}

export function useShortcutRuntime() {
  const runtime = useContext(ShortcutRuntimeContext)
  if (!runtime) throw new Error('ShortcutRuntimeProvider is missing')
  return runtime
}
