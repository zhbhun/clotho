import type { CommandCatalog, CommandId } from '@/shared/shortcuts'

export type CommandHandler = () => Promise<void> | void

export interface RegisteredCommand {
  readonly enabled: boolean
  readonly handler: CommandHandler
}

export function createCommandRegistry(catalog: CommandCatalog) {
  const registrations = new Map<
    CommandId,
    { enabled: boolean; handler: CommandHandler; token: symbol }
  >()
  const listeners = new Set<() => void>()
  let version = 0

  function emit() {
    version += 1
    for (const listener of listeners) listener()
  }

  return {
    get(commandId: CommandId): RegisteredCommand | undefined {
      return registrations.get(commandId)
    },
    getVersion() {
      return version
    },
    register(commandId: CommandId, handler: CommandHandler, options: { enabled?: boolean } = {}) {
      if (!Object.hasOwn(catalog, commandId)) throw new Error(`Unknown command: ${commandId}`)
      if (registrations.has(commandId)) {
        throw new Error(`Command already registered: ${commandId}`)
      }

      const token = Symbol(commandId)
      const registration = { enabled: options.enabled ?? true, handler, token }
      registrations.set(commandId, registration)
      emit()
      let isDisposed = false

      return {
        dispose() {
          if (isDisposed) return
          isDisposed = true
          if (registrations.get(commandId)?.token !== token) return
          registrations.delete(commandId)
          emit()
        },
        setEnabled(enabled: boolean) {
          if (isDisposed || registration.enabled === enabled) return
          registration.enabled = enabled
          emit()
        },
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type CommandRegistry = ReturnType<typeof createCommandRegistry>
