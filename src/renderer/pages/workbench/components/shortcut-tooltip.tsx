import { type ComponentProps, type ReactElement, useSyncExternalStore } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import type { CommandId } from '@/shared/shortcuts'

import { formatShortcutBinding } from '../../../services/shortcuts/bindings'
import { getEffectiveBindings } from '../../../services/shortcuts/keymap'
import { useShortcutRuntime } from '../../../services/shortcuts/runtime'

// Extra props are forwarded to the trigger so this component can itself be the
// `render` target of another trigger (e.g. CommandDialog's DialogTrigger).
export function ShortcutTooltip({
  commandId,
  label,
  side,
  children,
  ...triggerProps
}: {
  commandId: CommandId
  label: string
  side?: ComponentProps<typeof TooltipContent>['side']
  children: ReactElement
} & Omit<ComponentProps<typeof TooltipTrigger>, 'children' | 'render'>) {
  const { catalog, overrides, platform } = useShortcutRuntime()
  const snapshot = useSyncExternalStore(overrides.subscribe, overrides.getSnapshot)
  const binding = getEffectiveBindings(commandId, catalog, snapshot.overrides)[0]

  return (
    <Tooltip>
      <TooltipTrigger render={children} {...triggerProps} />
      <TooltipContent side={side}>
        <span>{label}</span>
        {binding ? (
          <span className="text-foreground-subtlest">
            {formatShortcutBinding(binding, platform)}
          </span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
