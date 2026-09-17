import {
  ANY_SHORTCUT_SCOPE,
  type CommandCatalog,
  type CommandId,
  type CommandScope,
  type ShortcutBinding,
  type ShortcutOverrides,
  type ShortcutPlatform,
  type ShortcutScopeId,
} from '@/shared/shortcuts'

import { bindingSignature } from './bindings'
import { getEffectiveBindings } from './keymap'
import type { CommandRegistry } from './registry'
import { scopeMatches } from './scope'

export interface ResolvedShortcut {
  binding: ShortcutBinding
  commandId: CommandId
}

export interface ShortcutConflict {
  commandId: CommandId
  type: 'hard' | 'shadow'
}

function toScopes(scope: CommandScope): readonly ShortcutScopeId[] {
  return Array.isArray(scope) ? scope : [scope as ShortcutScopeId]
}

function scopeDepth(scope: ShortcutScopeId) {
  return scope === ANY_SHORTCUT_SCOPE ? -1 : scope.split('.').length
}

function deepestMatchingScope(scope: CommandScope, currentScope: ShortcutScopeId | null) {
  let match: ShortcutScopeId | undefined
  for (const candidate of toScopes(scope)) {
    if (!scopeMatches(candidate, currentScope)) continue
    if (!match || scopeDepth(candidate) > scopeDepth(match)) match = candidate
  }
  return match
}

function scopeConflictType(left: ShortcutScopeId, right: ShortcutScopeId) {
  if (left === ANY_SHORTCUT_SCOPE || right === ANY_SHORTCUT_SCOPE || left === right) {
    return 'hard' as const
  }
  if (left.startsWith(`${right}.`) || right.startsWith(`${left}.`)) return 'shadow' as const
  return null
}

export function findShortcutConflicts({
  binding,
  catalog,
  commandId,
  overrides,
  platform,
}: {
  binding: ShortcutBinding
  catalog: CommandCatalog
  commandId: CommandId
  overrides: ShortcutOverrides
  platform: ShortcutPlatform
}): ShortcutConflict[] {
  const definition = catalog[commandId]
  if (!definition) return []
  const signature = bindingSignature(binding, platform)
  const conflicts: ShortcutConflict[] = []

  for (const [otherCommandId, otherDefinition] of Object.entries(catalog)) {
    if (otherCommandId === commandId) continue
    if (
      !getEffectiveBindings(otherCommandId, catalog, overrides).some(
        (candidate) => bindingSignature(candidate, platform) === signature,
      )
    ) {
      continue
    }

    let type: ShortcutConflict['type'] | null = null
    for (const leftScope of toScopes(definition.scope)) {
      for (const rightScope of toScopes(otherDefinition.scope)) {
        const candidate = scopeConflictType(leftScope, rightScope)
        if (candidate === 'hard') type = 'hard'
        else if (candidate === 'shadow' && !type) type = 'shadow'
      }
    }
    if (type) conflicts.push({ commandId: otherCommandId, type })
  }

  return conflicts
}

export function resolveActiveBindings({
  catalog,
  currentScope,
  isCapturing,
  overrides,
  platform,
  registry,
}: {
  catalog: CommandCatalog
  currentScope: ShortcutScopeId | null
  isCapturing: boolean
  overrides: ShortcutOverrides
  platform: ShortcutPlatform
  registry: CommandRegistry
}): ResolvedShortcut[] {
  if (isCapturing) return []

  const candidatesByBinding = new Map<
    string,
    Array<ResolvedShortcut & { matchedScope: ShortcutScopeId }>
  >()

  for (const [commandId, definition] of Object.entries(catalog)) {
    const registration = registry.get(commandId)
    if (!registration?.enabled) continue
    const matchedScope = deepestMatchingScope(definition.scope, currentScope)
    if (!matchedScope) continue

    for (const binding of getEffectiveBindings(commandId, catalog, overrides)) {
      const signature = bindingSignature(binding, platform)
      const candidates = candidatesByBinding.get(signature) ?? []
      if (!candidates.some((candidate) => candidate.commandId === commandId)) {
        candidates.push({ binding, commandId, matchedScope })
        candidatesByBinding.set(signature, candidates)
      }
    }
  }

  const resolved: ResolvedShortcut[] = []
  for (const candidates of candidatesByBinding.values()) {
    if (
      candidates.length > 1 &&
      candidates.some(({ matchedScope }) => matchedScope === ANY_SHORTCUT_SCOPE)
    ) {
      continue
    }

    const deepest = Math.max(...candidates.map(({ matchedScope }) => scopeDepth(matchedScope)))
    const winners = candidates.filter(({ matchedScope }) => scopeDepth(matchedScope) === deepest)
    if (winners.length !== 1) continue
    resolved.push({ binding: winners[0].binding, commandId: winners[0].commandId })
  }

  return resolved
}
