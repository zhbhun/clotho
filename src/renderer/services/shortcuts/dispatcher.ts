import type { CommandId } from '@/shared/shortcuts'

import { getLogger } from '../logging'
import type { CommandRegistry } from './registry'

export type CommandDispatchResult = 'failed' | 'handled' | 'unavailable'

function reportDispatchError(caught: unknown, commandId: CommandId) {
  getLogger('shortcut').error('shortcut.failed', 'A shortcut command failed', {
    context: { commandId },
    error: caught,
  })
}

export async function dispatchCommand(
  registry: CommandRegistry,
  commandId: CommandId,
  onError: (caught: unknown, commandId: CommandId) => void = reportDispatchError,
): Promise<CommandDispatchResult> {
  const registration = registry.get(commandId)
  if (!registration?.enabled) return 'unavailable'

  try {
    await registration.handler()
    return 'handled'
  } catch (caught) {
    onError(caught, commandId)
    return 'failed'
  }
}
