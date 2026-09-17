import type { CommandId, ShortcutBinding, ShortcutOverrides } from '@/shared/shortcuts'

export interface ShortcutOverridesClient {
  load(): Promise<ShortcutOverrides>
  reset(commandId: CommandId): Promise<ShortcutOverrides>
  set(commandId: CommandId, bindings: ShortcutBinding[]): Promise<ShortcutOverrides>
}

interface ShortcutOverridesSnapshot {
  error: string | null
  isLoaded: boolean
  overrides: ShortcutOverrides
}

function cloneOverrides(overrides: ShortcutOverrides): ShortcutOverrides {
  return Object.fromEntries(
    Object.entries(overrides).map(([commandId, bindings]) => [
      commandId,
      bindings.map((binding) => ({ ...binding, modifiers: [...binding.modifiers] })),
    ]),
  )
}

function errorMessage(caught: unknown) {
  return caught instanceof Error ? caught.message : String(caught)
}

export function createShortcutOverridesStore(client: ShortcutOverridesClient) {
  const listeners = new Set<() => void>()
  let snapshot: ShortcutOverridesSnapshot = { error: null, isLoaded: false, overrides: {} }
  let initialization: Promise<void> | null = null

  function publish(next: ShortcutOverridesSnapshot) {
    snapshot = next
    for (const listener of listeners) listener()
  }

  function initialize() {
    if (snapshot.isLoaded && !snapshot.error) return Promise.resolve()
    if (initialization) return initialization

    initialization = client
      .load()
      .then((overrides) => {
        publish({ error: null, isLoaded: true, overrides: cloneOverrides(overrides) })
      })
      .catch((caught) => {
        publish({ ...snapshot, error: errorMessage(caught), isLoaded: true })
      })
      .finally(() => {
        initialization = null
      })
    return initialization
  }

  async function mutate(operation: () => Promise<ShortcutOverrides>) {
    await initialize()
    try {
      const overrides = await operation()
      publish({ error: null, isLoaded: snapshot.isLoaded, overrides: cloneOverrides(overrides) })
      return cloneOverrides(overrides)
    } catch (caught) {
      publish({ ...snapshot, error: errorMessage(caught) })
      throw caught
    }
  }

  return {
    getSnapshot() {
      return snapshot
    },
    initialize,
    reset(commandId: CommandId) {
      return mutate(() => client.reset(commandId))
    },
    set(commandId: CommandId, bindings: ShortcutBinding[]) {
      return mutate(() => client.set(commandId, bindings))
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type ShortcutOverridesStore = ReturnType<typeof createShortcutOverridesStore>
