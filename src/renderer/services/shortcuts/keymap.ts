import type {
  CommandCatalog,
  CommandId,
  ShortcutBinding,
  ShortcutOverrides,
} from '@/shared/shortcuts'

import { normalizeShortcutBinding } from './bindings'

export function getEffectiveBindings(
  commandId: CommandId,
  catalog: CommandCatalog,
  overrides: ShortcutOverrides,
): ShortcutBinding[] {
  const definition = catalog[commandId]
  if (!definition) return []

  const bindings = Object.hasOwn(overrides, commandId)
    ? overrides[commandId]
    : definition.defaultBindings

  return (bindings ?? []).map(normalizeShortcutBinding)
}
