import { ANY_SHORTCUT_SCOPE, type ShortcutScopeId } from '@/shared/shortcuts'

export function scopeMatches(commandScope: ShortcutScopeId, currentScope: ShortcutScopeId | null) {
  if (commandScope === ANY_SHORTCUT_SCOPE) return true
  return currentScope === commandScope || currentScope?.startsWith(`${commandScope}.`) === true
}

export interface ShortcutScopeOwner {
  readonly parent: ShortcutScopeOwner | null
  readonly token: symbol
}

export function createShortcutScopeManager() {
  const frames: Array<{
    owner: ShortcutScopeOwner | null
    scope: ShortcutScopeId
    token: symbol
  }> = []
  const listeners = new Set<() => void>()

  function isDescendantOwner(owner: ShortcutScopeOwner, ancestor: ShortcutScopeOwner) {
    let parent = owner.parent
    while (parent) {
      if (parent.token === ancestor.token) return true
      parent = parent.parent
    }
    return false
  }

  function getCurrent() {
    let current = frames.at(-1)
    while (current?.owner) {
      let descendant: (typeof frames)[number] | undefined
      for (const frame of frames) {
        if (frame.owner && isDescendantOwner(frame.owner, current.owner)) descendant = frame
      }
      if (!descendant) break
      current = descendant
    }
    return current?.scope ?? null
  }

  function emitIfChanged(previous: ShortcutScopeId | null) {
    if (previous === getCurrent()) return
    for (const listener of listeners) listener()
  }

  return {
    activate(scope: ShortcutScopeId, owner: ShortcutScopeOwner | null = null) {
      const previous = getCurrent()
      const token = Symbol(scope)
      frames.push({ owner, scope, token })
      emitIfChanged(previous)
      let isDisposed = false

      return () => {
        if (isDisposed) return
        isDisposed = true
        const current = getCurrent()
        const index = frames.findIndex((frame) => frame.token === token)
        if (index !== -1) frames.splice(index, 1)
        emitIfChanged(current)
      }
    },
    createOwner(parent: ShortcutScopeOwner | null = null): ShortcutScopeOwner {
      return { parent, token: Symbol('shortcut-scope-owner') }
    },
    getCurrent,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShortcutScopeManager = ReturnType<typeof createShortcutScopeManager>

export function createShortcutCaptureManager() {
  const owners = new Set<symbol>()
  const listeners = new Set<() => void>()

  function getSnapshot() {
    return owners.size > 0
  }

  function emitIfChanged(previous: boolean) {
    if (previous === getSnapshot()) return
    for (const listener of listeners) listener()
  }

  return {
    begin() {
      const previous = getSnapshot()
      const token = Symbol('shortcut-capture')
      owners.add(token)
      emitIfChanged(previous)
      let isDisposed = false

      return () => {
        if (isDisposed) return
        isDisposed = true
        const current = getSnapshot()
        owners.delete(token)
        emitIfChanged(current)
      }
    },
    getSnapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShortcutCaptureManager = ReturnType<typeof createShortcutCaptureManager>
