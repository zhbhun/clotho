import { useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

import {
  isDesktopRuntime,
  listenDesktopEvent,
  requestFromDesktop,
} from '../services/desktop/client'
import { eventMatchesShortcutBinding } from '../services/shortcuts/bindings'
import { dispatchCommand } from '../services/shortcuts/dispatcher'
import { resolveActiveBindings } from '../services/shortcuts/resolver'
import { useShortcutRuntime } from '../services/shortcuts/runtime'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.matches('input, textarea, select') ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  )
}

export function ShortcutHost() {
  const runtime = useShortcutRuntime()

  useEffect(() => {
    void runtime.overrides.initialize()
  }, [runtime])

  useEffect(() => {
    let stopped = false
    let unsubscribe: (() => void) | undefined
    void listenDesktopEvent('menu-command-dispatch', ({ commandId }) => {
      void dispatchCommand(runtime.registry, commandId)
    }).then(
      (stop) => {
        if (stopped) stop()
        else unsubscribe = stop
      },
      () => {},
    )
    return () => {
      stopped = true
      unsubscribe?.()
    }
  }, [runtime])

  useEffect(() => {
    if (!isDesktopRuntime()) return undefined
    // Menu accelerators swallow keystrokes before they reach the page, so the
    // native menu drops them while a shortcut recorder is capturing.
    const unsubscribe = runtime.capture.subscribe(() => {
      requestFromDesktop('applicationMenuSetCaptureActive', {
        active: runtime.capture.getSnapshot(),
      }).catch(() => undefined)
    })
    return () => {
      unsubscribe()
    }
  }, [runtime])

  useHotkeys(
    '*',
    (event) => {
      if (event.isComposing) return

      const overrideSnapshot = runtime.overrides.getSnapshot()
      if (!overrideSnapshot.isLoaded) return

      const winner = resolveActiveBindings({
        catalog: runtime.catalog,
        currentScope: runtime.scopes.getCurrent(),
        isCapturing: runtime.capture.getSnapshot(),
        overrides: overrideSnapshot.overrides,
        platform: runtime.platform,
        registry: runtime.registry,
      }).find(({ binding }) => eventMatchesShortcutBinding(event, binding, runtime.platform))
      if (!winner) return

      const definition = runtime.catalog[winner.commandId]
      if (event.repeat && !definition.allowRepeat) return
      if (isEditableTarget(event.target) && !definition.allowInEditable) return

      event.preventDefault()
      void dispatchCommand(runtime.registry, winner.commandId)
    },
    {
      enableOnContentEditable: true,
      enableOnFormTags: true,
      keydown: true,
      preventDefault: false,
      useKey: true,
    },
    [runtime],
  )

  return null
}
