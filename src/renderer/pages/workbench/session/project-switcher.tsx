import { type ComponentProps, type ReactElement, type ReactNode } from 'react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'

/** The row leaves about two icon buttons of trailing space; paths beyond what
    fits there elide their middle instead of their tail. */
export const PROJECT_PATH_MAX = 80

/** Extra props are forwarded to the trigger so this component can itself be the
    `render` target of another trigger (e.g. CommandDialog's DialogTrigger). */
export function ProjectTooltip({
  align = 'center',
  children,
  content,
  side = 'bottom',
  ...triggerProps
}: {
  align?: ComponentProps<typeof TooltipContent>['align']
  children: ReactElement
  content: ReactNode
  side?: ComponentProps<typeof TooltipContent>['side']
} & Omit<ComponentProps<typeof TooltipTrigger>, 'children' | 'render'>) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} {...triggerProps} />
      <TooltipContent align={align} side={side}>
        {content}
      </TooltipContent>
    </Tooltip>
  )
}
