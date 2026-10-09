import {
  ANY_SHORTCUT_SCOPE,
  type CommandCatalog,
  type CommandScope,
  type ShortcutPlatform,
} from '@/shared/shortcuts'

import { bindingSignature } from './bindings'
import { findShortcutConflicts } from './resolver'
import { getShortcutBindingIssue } from './validation'

export { commandCatalog } from '@/shared/command-catalog'

function toScopes(scope: CommandScope) {
  return Array.isArray(scope) ? scope : [scope as string]
}

export function validateCommandCatalog(catalog: CommandCatalog, platform: ShortcutPlatform) {
  for (const [commandId, definition] of Object.entries(catalog)) {
    const scopes = toScopes(definition.scope)
    if (scopes.length === 0) throw new Error(`Command ${commandId} must declare a scope`)
    if (scopes.includes(ANY_SHORTCUT_SCOPE) && scopes.length > 1) {
      throw new Error(`Command ${commandId} cannot combine "*" with other scopes`)
    }

    const signatures = new Set<string>()
    for (const binding of definition.defaultBindings) {
      const issue = getShortcutBindingIssue(binding)
      if (issue) throw new Error(`Invalid default keybinding for command ${commandId}: ${issue}`)

      const signature = bindingSignature(binding, platform)
      if (signatures.has(signature)) {
        throw new Error(`Duplicate default keybinding for command ${commandId}`)
      }
      signatures.add(signature)

      const hardConflict = findShortcutConflicts({
        binding,
        catalog,
        commandId,
        overrides: {},
        platform,
      }).find((conflict) => conflict.type === 'hard')
      if (hardConflict) {
        throw new Error(
          `Default keybinding conflict between ${commandId} and ${hardConflict.commandId}`,
        )
      }
    }
  }
}
