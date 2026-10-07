import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { DialogClose, DialogFooter, DialogHeader, DialogTitle } from '@/shadcn/dialog'
import { Field, FieldError, FieldLabel } from '@/shadcn/field'
import { Input } from '@/shadcn/input'
import { Spinner } from '@/shadcn/spinner'

import { AppDialog, AppDialogContent } from '../../../components/app-dialog'
import { claude } from '../../../services/claude/claude'
import { useWorkbenchStore } from '../stores/workbench-store'

export type CreateBranchDialogProps = {
  onOpenChange: (open: boolean) => void
  open: boolean
  projectId: string
  projectPath: string
}

/** Dialog for naming a new branch; creating checks it out from the current HEAD. */
export function CreateBranchDialog({
  onOpenChange,
  open,
  projectId,
  projectPath,
}: CreateBranchDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [existingNames, setExistingNames] = useState<Set<string> | null>(null)
  const [gitError, setGitError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (!open) return
    setName('')
    setGitError(null)
    setIsCreating(false)
    // Local branch names only matter for the duplicate hint; a failed fetch
    // just skips the hint and lets git report a conflict on create.
    claude
      .listProjectGitBranches(projectPath)
      .then((branches) => setExistingNames(new Set((branches ?? []).map((b) => b.name))))
      .catch(() => setExistingNames(null))
  }, [open, projectPath])

  const trimmedName = name.trim()
  const isDuplicate = Boolean(existingNames?.has(trimmedName))

  async function handleCreate() {
    if (!trimmedName || isCreating) return
    setIsCreating(true)
    setGitError(null)
    try {
      const result = await claude.switchProjectGitBranch({
        branch: trimmedName,
        create: true,
        projectPath,
      })
      if (!result.branch) {
        setGitError(result.error ?? t('workbench.branch.switchFailed'))
        return
      }
      useWorkbenchStore.getState().setProjectGitBranch(projectId, result.branch)
      onOpenChange(false)
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <AppDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isCreating) onOpenChange(nextOpen)
      }}
    >
      <AppDialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('workbench.branch.createTitle')}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handleCreate()
          }}
        >
          <Field data-invalid={Boolean(gitError) || isDuplicate}>
            <FieldLabel htmlFor="create-branch-name">{t('workbench.branch.nameLabel')}</FieldLabel>
            <Input
              aria-invalid={Boolean(gitError) || isDuplicate}
              autoFocus
              disabled={isCreating}
              id="create-branch-name"
              placeholder="new-branch"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setGitError(null)
              }}
            />
            <FieldError>
              {isDuplicate ? t('workbench.branch.nameExists') : (gitError ?? null)}
            </FieldError>
          </Field>
          <DialogFooter>
            <DialogClose render={<Button disabled={isCreating} type="button" variant="outline" />}>
              {t('common.cancel')}
            </DialogClose>
            <Button disabled={isCreating || !trimmedName || isDuplicate} type="submit">
              {isCreating ? <Spinner data-icon="inline-start" /> : null}
              {t('workbench.branch.createAction')}
            </Button>
          </DialogFooter>
        </form>
      </AppDialogContent>
    </AppDialog>
  )
}
