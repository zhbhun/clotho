import { Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shadcn/alert-dialog'
import { Button } from '@/shadcn/button'
import { cn } from '@/shadcn/utils'

import { AppAlertDialog, AppAlertDialogContent } from '../../../components/app-dialog'
import { SettingsSection } from '../../../components/settings-section'

/**
 * Shared list-section shell for the six agent capability domains: heading,
 * optional add action, and an empty hint.
 */
export function AgentSection({
  titleKey,
  addLabel,
  onAdd,
  children,
}: {
  titleKey: 'subagents' | 'plugins' | 'mcp' | 'skills'
  addLabel?: string
  onAdd?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t(`settings.agent.title.${titleKey}`)}
      action={
        onAdd && addLabel ? (
          <Button size="sm" variant="outline" onClick={onAdd}>
            {addLabel}
          </Button>
        ) : undefined
      }
    >
      {children}
    </SettingsSection>
  )
}

/** Shared "nothing here yet" row for empty lists. */
export function AgentEmpty() {
  const { t } = useTranslation()
  return <p className="text-sm text-foreground-subtlest">{t('settings.agent.empty')}</p>
}

/** UI label for a lowercase enum value; storage keeps the verbatim literal. */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** Shared delete-confirmation dialog: title, copy, and confirm/cancel actions. */
function DeleteConfirmDialog({
  open,
  onOpenChange,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: () => Promise<void> | void
}) {
  const { t } = useTranslation()
  return (
    <AppAlertDialog onOpenChange={onOpenChange} open={open}>
      <AppAlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.agent.deleteConfirmTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('settings.agent.confirmDelete')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('settings.common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              void onDelete()
            }}
          >
            {t('settings.common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AppAlertDialog>
  )
}

/** Delete button with a confirm dialog; runs `onDelete` only on confirm. */
export function DeleteButton({
  label,
  onDelete,
  children,
}: {
  label: string
  onDelete: () => Promise<void> | void
  /** Render text inside the trigger instead of a trash icon. */
  children?: ReactNode
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Button
        aria-label={label}
        className="text-foreground-subtlest"
        size={children ? 'sm' : 'icon-sm'}
        variant="ghost"
        onClick={() => setConfirmOpen(true)}
      >
        {children ?? <Trash2 />}
      </Button>
      <DeleteConfirmDialog onDelete={onDelete} onOpenChange={setConfirmOpen} open={confirmOpen} />
    </>
  )
}

/**
 * Danger-styled delete trigger + shared confirm dialog, for editor footers.
 * Same dialog contract as `DeleteButton`; only the trigger styling differs.
 */
export function DeleteConfirmButton({
  label,
  onDelete,
  className,
}: {
  label: string
  onDelete: () => Promise<void> | void
  /** Extra classes for the trigger, e.g. `mr-auto` to pin it left. */
  className?: string
}) {
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Button
        aria-label={label}
        className={cn('text-destructive', className)}
        size="sm"
        variant="ghost"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 />
        {label}
      </Button>
      <DeleteConfirmDialog onDelete={onDelete} onOpenChange={setConfirmOpen} open={confirmOpen} />
    </>
  )
}
