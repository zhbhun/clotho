import type { TFunction } from 'i18next'
import { useId, useState } from 'react'
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
import {
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shadcn/dialog'
import { Field, FieldGroup, FieldLabel } from '@/shadcn/field'
import { Input } from '@/shadcn/input'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'

import {
  AppAlertDialog,
  AppAlertDialogContent,
  AppDialog,
  AppDialogContent,
} from '../../../components/app-dialog'
import { appErrorKey } from '../../../i18n/app-error'
import { type WorkbenchSession, useWorkbenchStore } from '../stores/workbench-store'
import { sessionDisplayTitle, sessionTitle } from '../utils/session-list'

export type SessionAction = {
  kind: 'delete' | 'rename'
  sessionId: string
}

export function SessionActionDialogs({
  action,
  onActionChange,
  onDeleteSession,
  onRenameSession,
}: {
  action: SessionAction | null
  onActionChange: (action: SessionAction | null) => void
  onDeleteSession: (sessionId: string) => Promise<void>
  onRenameSession: (sessionId: string, title: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const session = useWorkbenchStore((state) =>
    action ? state.sessions[action.sessionId] : undefined,
  )
  if (!action || !session) return null

  const handleClose = () => onActionChange(null)
  if (action.kind === 'rename') {
    return (
      <RenameSessionDialog
        key={action.sessionId}
        session={session}
        t={t}
        onClose={handleClose}
        onRenameSession={onRenameSession}
      />
    )
  }

  return (
    <DeleteSessionDialog
      key={action.sessionId}
      session={session}
      t={t}
      onClose={handleClose}
      onDeleteSession={onDeleteSession}
    />
  )
}

function RenameSessionDialog({
  session,
  t,
  onClose,
  onRenameSession,
}: {
  session: WorkbenchSession
  t: TFunction
  onClose: () => void
  onRenameSession: (sessionId: string, title: string) => Promise<void>
}) {
  const inputId = useId()
  const [isSaving, setIsSaving] = useState(false)
  const [title, setTitle] = useState(() => sessionTitle(session))
  const nextTitle = title.trim()

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!nextTitle || isSaving) return

    setIsSaving(true)
    try {
      await onRenameSession(session.id, nextTitle)
      onClose()
    } catch (caught) {
      const key = appErrorKey(caught)
      toast.add({
        title: t('common.toast.renameFailed'),
        description: key ? t(key) : t('workbench.error.renameFailed'),
        type: 'error',
      })
      setIsSaving(false)
    }
  }

  return (
    <AppDialog open onOpenChange={(open) => !open && !isSaving && onClose()}>
      <AppDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workbench.dialog.renameSession')}</DialogTitle>
          <DialogDescription>{t('workbench.dialog.renameDescription')}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel className="sr-only" htmlFor={inputId}>
                {t('workbench.dialog.sessionName')}
              </FieldLabel>
              <Input
                autoFocus
                disabled={isSaving}
                id={inputId}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onFocus={(event) => event.currentTarget.select()}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose disabled={isSaving} render={<Button variant="outline" />}>
              {t('workbench.action.cancel')}
            </DialogClose>
            <Button disabled={!nextTitle || isSaving} type="submit">
              {isSaving ? <Spinner data-icon="inline-start" /> : null}
              {t('workbench.action.save')}
            </Button>
          </DialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  )
}

function DeleteSessionDialog({
  session,
  t,
  onClose,
  onDeleteSession,
}: {
  session: WorkbenchSession
  t: TFunction
  onClose: () => void
  onDeleteSession: (sessionId: string) => Promise<void>
}) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      await onDeleteSession(session.id)
      onClose()
    } catch (caught) {
      const key = appErrorKey(caught)
      toast.add({
        title: t('common.toast.deleteFailed'),
        description: key ? t(key) : t('workbench.error.deleteFailed'),
        type: 'error',
      })
      setIsDeleting(false)
    }
  }

  return (
    <AppAlertDialog open onOpenChange={(open) => !open && !isDeleting && onClose()}>
      <AppAlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('workbench.dialog.deleteSession')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('workbench.dialog.deleteSessionDescription', {
              title: sessionDisplayTitle(session, t),
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('workbench.action.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction disabled={isDeleting} variant="destructive" onClick={handleDelete}>
            {isDeleting ? <Spinner data-icon="inline-start" /> : null}
            {t('workbench.action.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AppAlertDialogContent>
    </AppAlertDialog>
  )
}
