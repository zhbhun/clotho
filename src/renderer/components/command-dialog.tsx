import type { ComponentProps, ReactElement, ReactNode } from 'react'

import { DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shadcn/dialog'
import { cn } from '@/shadcn/utils'

import { AppDialog, AppDialogContent } from './app-dialog'

/**
 * Dialog wrapper for command palettes:
 * provides visually hidden title/description, a glass surface, and an optional trigger.
 * Dismissal restores focus according to how the dialog was opened (see AppDialogContent).
 */
export function CommandDialog({
  title = 'Command Palette',
  description = 'Search for a command to run...',
  children,
  className,
  glass = false,
  showCloseButton = false,
  showOverlay = true,
  trigger,
  triggerId: triggerIdProp,
  ...props
}: Omit<ComponentProps<typeof AppDialog>, 'children'> & {
  title?: string
  description?: string
  className?: string
  glass?: boolean
  showCloseButton?: boolean
  showOverlay?: boolean
  trigger?: ReactElement
  children: ReactNode
}) {
  return (
    <AppDialog {...props} triggerId={triggerIdProp}>
      {trigger ? <DialogTrigger id={triggerIdProp ?? undefined} render={trigger} /> : null}
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <AppDialogContent
        className={cn('overflow-hidden rounded-xl! bg-popover/60 p-0 backdrop-blur-sm', className)}
        glass={glass}
        showCloseButton={showCloseButton}
        showOverlay={showOverlay}
      >
        {children}
      </AppDialogContent>
    </AppDialog>
  )
}
