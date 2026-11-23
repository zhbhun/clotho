import { useTranslation } from 'react-i18next'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shadcn/alert-dialog'

import { AppAlertDialog, AppAlertDialogContent } from '../app-dialog'

/**
 * Unsaved-changes guard for the subagent detail page: confirming discards the
 * edits and runs the pending navigation; declining keeps editing (design D4/D5).
 */
export function DiscardChangesDialog({
  open,
  subject,
  onOpenChange,
  onDiscard,
}: {
  open: boolean
  subject: string
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
}) {
  const { t } = useTranslation()
  return (
    <AppAlertDialog onOpenChange={onOpenChange} open={open}>
      <AppAlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('settings.detail.discardTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('settings.detail.discardDescription', { subject })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('settings.detail.discardKeepEditing')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onOpenChange(false)
              onDiscard()
            }}
          >
            {t('settings.detail.discardConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AppAlertDialog>
  )
}
