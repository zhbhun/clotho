import { FolderRoot, SquarePen } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/shadcn/field'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shadcn/input-group'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import type { ProjectIcon as ProjectIconValue } from '@/shared/rpc'

import { appErrorKey } from '../i18n/app-error'
import { type ClaudeProject, claude } from '../services/claude/claude'
import { projectNameFromPath } from '../utils/project'
import { AdditionalDirectoriesField } from './additional-directories-field'
import { IconPicker } from './project-icon-picker'
import { ProjectPath } from './project-path'

/**
 * Shared project add/edit form body: icon picker, name, folder path, and
 * additional directories, with validation and save. Consumed by the workbench
 * sidebar's dialog shell and the settings page's project detail page.
 */
export function ProjectForm({
  project,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  /** Existing project when editing; `null`/`undefined` when creating. */
  project?: ClaudeProject | null
  onSaved: (project: ClaudeProject) => Promise<void> | void
  onCancel: () => void
  /** Reports whether any field differs from its initial value (dirty guard). */
  onDirtyChange?: (isDirty: boolean) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [icon, setIcon] = useState<ProjectIconValue>()
  const [additionalDirs, setAdditionalDirs] = useState<string[]>([])
  const [nameError, setNameError] = useState<string | null>(null)
  const [pathError, setPathError] = useState<string | null>(null)
  const [isSaving, setSaving] = useState(false)
  const [isProcessingIcon, setProcessingIcon] = useState(false)
  const nameEditedRef = useRef(false)
  const isEditing = Boolean(project)

  // Dirty = any field differs from the snapshot taken once the fill effect
  // has landed; the fill runs after mount, so the baseline is set from the
  // same effect that populates the fields (comparing earlier would report
  // the freshly opened form as dirty).
  const baselineRef = useRef<string | null>(null)
  const fillState = JSON.stringify({ name, projectPath, icon, additionalDirs })
  useEffect(() => {
    setName(project?.name ?? (project ? projectNameFromPath(project.path) : ''))
    setProjectPath(project?.path ?? '')
    setIcon(project?.icon)
    setAdditionalDirs(project?.additional_directories ?? [])
    setNameError(null)
    setPathError(null)
    setSaving(false)
    setProcessingIcon(false)
    nameEditedRef.current = false
    baselineRef.current = JSON.stringify({
      name: project?.name ?? (project ? projectNameFromPath(project.path) : ''),
      projectPath: project?.path ?? '',
      icon: project?.icon,
      additionalDirs: project?.additional_directories ?? [],
    })
  }, [project])
  useEffect(() => {
    if (!onDirtyChange || baselineRef.current === null) return
    onDirtyChange(fillState !== baselineRef.current)
  }, [fillState, onDirtyChange])
  useEffect(() => {
    return () => onDirtyChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSelectFolder() {
    setPathError(null)
    try {
      const selectedPath = await claude.selectProjectFolder({
        ...(projectPath && { startingFolder: projectPath }),
      })
      if (!selectedPath) return
      setProjectPath(selectedPath)
      if (!nameEditedRef.current) setName(projectNameFromPath(selectedPath))
    } catch (caught) {
      const key = appErrorKey(caught)
      toast.add({
        title: t('common.toast.selectFolderFailed'),
        description: key ? t(key) : t('project.error.selectFolder'),
        type: 'error',
      })
    }
  }

  async function handleAddDirectory() {
    try {
      const selectedPath = await claude.selectProjectFolder({
        ...(projectPath && { startingFolder: projectPath }),
      })
      if (!selectedPath) return
      setAdditionalDirs((current) =>
        selectedPath === projectPath || current.includes(selectedPath)
          ? current
          : [...current, selectedPath],
      )
    } catch (caught) {
      const key = appErrorKey(caught)
      toast.add({
        title: t('common.toast.selectFolderFailed'),
        description: key ? t(key) : t('project.error.selectFolder'),
        type: 'error',
      })
    }
  }

  function handleRemoveDirectory(directory: string) {
    setAdditionalDirs((current) => current.filter((item) => item !== directory))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    const nextNameError = !normalizedName
      ? t('project.error.nameRequired')
      : normalizedName.length > 50
        ? t('project.error.nameTooLong')
        : null
    const nextPathError = projectPath ? null : t('project.error.selectFolderRequired')
    setNameError(nextNameError)
    setPathError(nextPathError)
    if (nextNameError || nextPathError || isProcessingIcon) return

    setSaving(true)
    try {
      const saved = project
        ? await claude.updateProject({
            projectId: project.id,
            name: normalizedName,
            icon: icon ?? null,
            additionalDirectories: additionalDirs,
          })
        : await claude.createProject({
            path: projectPath,
            name: normalizedName,
            icon,
            additionalDirectories: additionalDirs,
          })
      await onSaved(saved)
    } catch (caught) {
      const key = appErrorKey(caught)
      if (key === 'project.error.pathMissing' || key === 'project.error.pathNotFolder') {
        setPathError(t(key))
        return
      }
      toast.add({
        title: key ? t(key) : t(isEditing ? 'project.error.save' : 'project.error.create'),
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <FieldGroup>
        <div className="flex justify-center py-2">
          <IconPicker
            disabled={isSaving || isProcessingIcon}
            value={icon}
            onChange={setIcon}
            onProcessingChange={setProcessingIcon}
          />
        </div>

        <Field data-invalid={Boolean(nameError)}>
          <FieldLabel htmlFor="project-name">{t('project.name')}</FieldLabel>
          <InputGroup>
            <InputGroupAddon className="py-0 pr-2">
              <SquarePen className="text-foreground-subtlest" strokeWidth={1.5} />
            </InputGroupAddon>
            <InputGroupInput
              aria-invalid={Boolean(nameError)}
              disabled={isSaving}
              id="project-name"
              maxLength={50}
              placeholder={t('project.name.placeholder')}
              value={name}
              onChange={(event) => {
                nameEditedRef.current = true
                setName(event.target.value)
                setNameError(null)
              }}
            />
          </InputGroup>
          <FieldError>{nameError}</FieldError>
        </Field>

        <Field data-invalid={Boolean(pathError)}>
          <FieldLabel>{t('project.path')}</FieldLabel>
          {isEditing ? (
            <div className="flex h-7 items-center gap-3.5 rounded-md border border-input bg-input/20 px-2 dark:bg-input/30">
              <FolderRoot
                className="size-3.5 shrink-0 text-foreground-subtlest"
                strokeWidth={1.5}
              />
              <ProjectPath
                className="min-w-0 flex-1 font-mono text-xs text-foreground-subtlest"
                path={projectPath}
              />
            </div>
          ) : (
            <Button
              aria-label={t('project.selectFolder')}
              aria-invalid={Boolean(pathError)}
              className="h-7 w-full justify-start gap-3.5 border-input bg-input/20 px-2 hover:bg-input dark:hover:bg-input"
              disabled={isSaving}
              type="button"
              variant="outline"
              onClick={handleSelectFolder}
            >
              <FolderRoot
                className="text-foreground-subtlest group-hover/button:text-foreground"
                strokeWidth={1.5}
              />
              {projectPath ? (
                <ProjectPath
                  className="min-w-0 flex-1 font-mono text-xs text-foreground-subtlest"
                  path={projectPath}
                />
              ) : (
                <span className="truncate text-foreground-subtlest">
                  {t('project.selectFolder')}
                </span>
              )}
            </Button>
          )}
          <FieldError>{pathError}</FieldError>
        </Field>

        <Field>
          <FieldLabel>{t('project.additionalDirs')}</FieldLabel>
          <AdditionalDirectoriesField
            directories={additionalDirs}
            disabled={isSaving}
            onAdd={handleAddDirectory}
            onRemove={handleRemoveDirectory}
          />
        </Field>
      </FieldGroup>

      <div className="flex items-center justify-end gap-2">
        <Button disabled={isSaving} type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button
          disabled={isSaving || isProcessingIcon || !name.trim() || !projectPath.trim()}
          type="submit"
        >
          {isSaving || isProcessingIcon ? <Spinner data-icon="inline-start" /> : null}
          {isEditing ? t('common.save') : t('project.add')}
        </Button>
      </div>
    </form>
  )
}
