import { useTranslation } from 'react-i18next'

import { DialogDescription, DialogHeader, DialogTitle } from '@/shadcn/dialog'

import { AppDialog, AppDialogContent } from '../../../components/app-dialog'
import { ProjectForm } from '../../../components/project-form'
import { type ClaudeProject } from '../../../services/claude/claude'

export function ProjectDialog({
  open,
  project,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  project?: ClaudeProject | null
  onOpenChange: (open: boolean) => void
  onSaved: (project: ClaudeProject) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const isEditing = Boolean(project)

  return (
    <AppDialog open={open} onOpenChange={(nextOpen) => onOpenChange(nextOpen)}>
      <AppDialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? t('project.edit') : t('project.add')}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing ? t('project.edit') : t('project.add')}
          </DialogDescription>
        </DialogHeader>

        <ProjectForm
          key={String(open) + (project?.id ?? '')}
          project={project}
          onSaved={async (saved) => {
            await onSaved(saved)
            onOpenChange(false)
          }}
          onCancel={() => onOpenChange(false)}
        />
      </AppDialogContent>
    </AppDialog>
  )
}
