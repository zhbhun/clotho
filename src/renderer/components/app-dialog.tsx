import { type ComponentProps, type ReactNode, createContext, useContext } from 'react'

import { AlertDialogContent } from '@/shadcn/alert-dialog'
import { DialogContent } from '@/shadcn/dialog'

import { ShortcutAlertDialog, ShortcutDialog } from './shortcut-dialog'
import { useDialogFocusReturn } from './use-dialog-focus-return'

type FinalFocus = (closeType: string) => HTMLElement | false

const DialogFocusReturnContext = createContext<FinalFocus | null>(null)

/** Dialog root that applies the app-wide focus return policy. */
export function AppDialog({
  children,
  onOpenChange,
  open,
  ...props
}: Omit<ComponentProps<typeof ShortcutDialog>, 'children'> & { children: ReactNode }) {
  const { captureReturnFocus, finalFocus } = useDialogFocusReturn(open)

  return (
    <ShortcutDialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (nextOpen) captureReturnFocus()
        onOpenChange?.(nextOpen, eventDetails)
      }}
      {...props}
    >
      <DialogFocusReturnContext value={finalFocus}>{children}</DialogFocusReturnContext>
    </ShortcutDialog>
  )
}

/** Alert dialog root that applies the app-wide focus return policy. */
export function AppAlertDialog({
  children,
  onOpenChange,
  open,
  ...props
}: Omit<ComponentProps<typeof ShortcutAlertDialog>, 'children'> & { children: ReactNode }) {
  const { captureReturnFocus, finalFocus } = useDialogFocusReturn(open)

  return (
    <ShortcutAlertDialog
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (nextOpen) captureReturnFocus()
        onOpenChange?.(nextOpen, eventDetails)
      }}
      {...props}
    >
      <DialogFocusReturnContext value={finalFocus}>{children}</DialogFocusReturnContext>
    </ShortcutAlertDialog>
  )
}

/**
 * Dialog surface paired with AppDialog / AppAlertDialog: keyboard dismissal
 * returns focus to the element focused before the dialog opened, otherwise
 * focus falls back to the window. Pass an explicit `finalFocus` to override.
 */
export function AppDialogContent({ finalFocus, ...props }: ComponentProps<typeof DialogContent>) {
  const defaultFinalFocus = useContext(DialogFocusReturnContext)

  return <DialogContent finalFocus={finalFocus ?? defaultFinalFocus ?? undefined} {...props} />
}

export function AppAlertDialogContent({
  finalFocus,
  ...props
}: ComponentProps<typeof AlertDialogContent>) {
  const defaultFinalFocus = useContext(DialogFocusReturnContext)

  return <AlertDialogContent finalFocus={finalFocus ?? defaultFinalFocus ?? undefined} {...props} />
}
