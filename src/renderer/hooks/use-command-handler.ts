import { useEffect, useLayoutEffect, useRef } from 'react'

import type { CommandId } from '@/shared/shortcuts'

import type { CommandHandler } from '../services/shortcuts/registry'
import { useShortcutRuntime } from '../services/shortcuts/runtime'

export function useCommandHandler(
  commandId: CommandId,
  handler: CommandHandler,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const { registry } = useShortcutRuntime()
  const handlerRef = useRef(handler)
  const enabledRef = useRef(enabled)
  const registrationRef = useRef<ReturnType<typeof registry.register> | null>(null)

  useLayoutEffect(() => {
    handlerRef.current = handler
    enabledRef.current = enabled
  }, [enabled, handler])

  useEffect(() => {
    const registration = registry.register(commandId, () => handlerRef.current(), {
      enabled: enabledRef.current,
    })
    registrationRef.current = registration
    return () => {
      registrationRef.current = null
      registration.dispose()
    }
  }, [commandId, registry])

  useEffect(() => {
    registrationRef.current?.setEnabled(enabled)
  }, [commandId, enabled, registry])
}
