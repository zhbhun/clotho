import { type ComponentProps, useState } from 'react'

import { AlertDialog } from '@/shadcn/alert-dialog'
import { Dialog } from '@/shadcn/dialog'

import { ShortcutScope } from './shortcut-scope'

const OVERLAY_SHORTCUT_SCOPE = 'overlay'

export function ShortcutDialog({
  defaultOpen,
  open,
  onOpenChange,
  ...props
}: ComponentProps<typeof Dialog>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const isOpen = open ?? uncontrolledOpen

  return (
    <ShortcutScope scope={isOpen ? OVERLAY_SHORTCUT_SCOPE : null}>
      <Dialog
        {...props}
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (open === undefined) setUncontrolledOpen(nextOpen)
          onOpenChange?.(nextOpen, eventDetails)
        }}
      />
    </ShortcutScope>
  )
}

export function ShortcutAlertDialog({
  defaultOpen,
  open,
  onOpenChange,
  ...props
}: ComponentProps<typeof AlertDialog>) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const isOpen = open ?? uncontrolledOpen

  return (
    <ShortcutScope scope={isOpen ? OVERLAY_SHORTCUT_SCOPE : null}>
      <AlertDialog
        {...props}
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={(nextOpen, eventDetails) => {
          if (open === undefined) setUncontrolledOpen(nextOpen)
          onOpenChange?.(nextOpen, eventDetails)
        }}
      />
    </ShortcutScope>
  )
}
