import { FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
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
import { Card, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/empty'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'

import { AppAlertDialog, AppAlertDialogContent } from '../../../components/app-dialog'
import { ProjectIcon } from '../../../components/project-icon'
import { ProjectPath } from '../../../components/project-path'
import type { ClaudeProject } from '../../../services/claude/claude'
import { compareProjectsByName, projectDisplayName } from '../../../utils/project'

function ProjectRows({
  projects,
  onEditProject,
  onRemoveProject,
}: {
  projects: ClaudeProject[]
  onEditProject: (project: ClaudeProject) => void
  onRemoveProject: (project: ClaudeProject) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-3">
      {projects.map((project) => {
        const name = projectDisplayName(project)
        return (
          <Card key={project.id} className="group/project-row gap-0 py-0">
            <CardHeader className="flex min-h-16 flex-row items-center gap-3 px-3 py-2">
              <ProjectIcon plain icon={project.icon} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <CardTitle className="shrink-0 truncate text-sm leading-normal font-medium">
                  {name}
                </CardTitle>
                <CardDescription className="min-w-0">
                  <ProjectPath className="text-xs text-foreground-subtlest" path={project.path} />
                </CardDescription>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label={t('settings.provider.editProvider', { name })}
                        className="invisible group-hover/project-row:visible"
                        size="icon-sm"
                        type="button"
                        variant="mute"
                        onClick={() => onEditProject(project)}
                      />
                    }
                  >
                    <Pencil />
                  </TooltipTrigger>
                  <TooltipContent>{t('settings.common.edit')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label={t('settings.project.removeNamed', { name })}
                        className="invisible group-hover/project-row:visible"
                        size="icon-sm"
                        type="button"
                        variant="mute"
                        onClick={() => onRemoveProject(project)}
                      />
                    }
                  >
                    <Trash2 />
                  </TooltipTrigger>
                  <TooltipContent>{t('settings.project.remove')}</TooltipContent>
                </Tooltip>
              </div>
            </CardHeader>
          </Card>
        )
      })}
    </div>
  )
}

export function ProjectSettings({
  error,
  isLoading = false,
  projects,
  onCreateProject,
  onEditProject,
  onReload,
  onRemoveProject,
}: {
  error?: string | null
  isLoading?: boolean
  projects: ClaudeProject[]
  onCreateProject: () => void
  onEditProject: (project: ClaudeProject) => void
  onReload?: () => Promise<void> | void
  onRemoveProject: (project: ClaudeProject) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [removeTarget, setRemoveTarget] = useState<ClaudeProject | null>(null)
  const [isRemoving, setRemoving] = useState(false)
  const sortedProjects = useMemo(() => projects.toSorted(compareProjectsByName), [projects])

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    try {
      await onRemoveProject(removeTarget)
      setRemoveTarget(null)
    } catch {
      toast.add({
        id: 'settings-project-remove-error',
        title: t('common.toast.removeFailed'),
        description: t('settings.project.removeError'),
        type: 'error',
      })
    } finally {
      setRemoving(false)
    }
  }

  function handleReload() {
    if (!onReload) return
    try {
      void Promise.resolve(onReload()).catch(() => {})
    } catch {
      // The owner exposes the reload failure through the error prop.
    }
  }

  let content
  if (isLoading) {
    content = null
  } else if (error) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderPlus />
          </EmptyMedia>
          <EmptyTitle>{t('settings.project.loadError')}</EmptyTitle>
          <EmptyDescription>{t('settings.project.loadErrorDescription')}</EmptyDescription>
        </EmptyHeader>
        {onReload ? (
          <EmptyContent>
            <Button type="button" variant="outline" onClick={handleReload}>
              {t('settings.project.reload')}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    )
  } else if (sortedProjects.length === 0) {
    content = (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderPlus />
          </EmptyMedia>
          <EmptyTitle>{t('settings.project.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('settings.project.emptyDescription')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" onClick={onCreateProject}>
            <Plus data-icon="inline-start" />
            {t('settings.project.add')}
          </Button>
        </EmptyContent>
      </Empty>
    )
  } else {
    content = (
      <ProjectRows
        projects={sortedProjects}
        onEditProject={onEditProject}
        onRemoveProject={(project) => {
          setRemoveTarget(project)
        }}
      />
    )
  }

  return (
    <>
      <section className="flex flex-col gap-3">
        {sortedProjects.length > 0 ? (
          <div className="flex min-h-7 items-center justify-end">
            <Button type="button" variant="outline" onClick={onCreateProject}>
              <Plus data-icon="inline-start" />
              {t('settings.project.add')}
            </Button>
          </div>
        ) : null}
        {content}
      </section>

      <AppAlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open && !isRemoving) setRemoveTarget(null)
        }}
      >
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.project.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.project.confirmDescription', {
                name: removeTarget ? projectDisplayName(removeTarget) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeTarget ? (
            <p className="break-all font-mono text-xs text-foreground-subtlest">
              {removeTarget.path}
            </p>
          ) : null}
          <p className="text-xs text-foreground-subtle">{t('settings.project.confirmNote')}</p>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemoving}>
              {t('settings.common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isRemoving}
              variant="destructive"
              onClick={(event) => {
                event.preventDefault()
                void handleRemove()
              }}
            >
              {isRemoving ? <Spinner data-icon="inline-start" /> : null}
              {t('settings.project.remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AppAlertDialog>
    </>
  )
}
