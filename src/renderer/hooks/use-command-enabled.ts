import { useSyncExternalStore } from 'react'

import type { CommandId } from '@/shared/shortcuts'

import { useShortcutRuntime } from '../services/shortcuts/runtime'

export function useCommandEnabled(commandId: CommandId) {
  const { registry } = useShortcutRuntime()
  // The registry publishes a version counter instead of per-command snapshots,
  // so re-reading `enabled` after each version bump keeps callers in sync.
  useSyncExternalStore(registry.subscribe, registry.getVersion)
  return registry.get(commandId)?.enabled ?? false
}
