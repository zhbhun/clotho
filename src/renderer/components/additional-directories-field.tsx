import { Folder, FolderPlus, X } from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import { projectNameFromPath } from '../utils/project'
import { ProjectPath } from './project-path'

export function AdditionalDirectoriesField({
  disabled,
  directories,
  onAdd,
  onRemove,
}: {
  disabled: boolean
  directories: string[]
  onAdd: () => void
  onRemove: (directory: string) => void
}) {
  const { t } = useTranslation()

  if (directories.length === 0) {
    return (
      <Button
        className="h-7 w-full justify-start gap-3.5 border-input bg-background px-2 text-foreground-subtlest hover:bg-accent"
        disabled={disabled}
        type="button"
        variant="outline"
        onClick={onAdd}
      >
        <FolderPlus className="group-hover/button:text-foreground" strokeWidth={1.5} />
        <span className="truncate text-foreground-subtlest">{t('project.additionalDirs.add')}</span>
      </Button>
    )
  }

  return (
    <div className="rounded-md border border-input bg-background">
      <ul>
        {directories.map((directory, index) => {
          const name = projectNameFromPath(directory)
          return (
            <Fragment key={directory}>
              {index > 0 ? (
                <div aria-hidden="true" className="mx-2.5 h-px bg-border-card-divider" />
              ) : null}
              <li className="flex h-8 items-center gap-3.5 px-2.5">
                <Folder className="size-4 shrink-0 text-foreground-subtlest" strokeWidth={1.5} />
                <ProjectPath
                  className="flex-1 font-mono text-xs text-foreground-subtlest"
                  path={directory}
                />
                <Button
                  aria-label={t('project.additionalDirs.remove', { name })}
                  className="hover:bg-accent"
                  disabled={disabled}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                  onClick={() => onRemove(directory)}
                >
                  <X strokeWidth={1.5} />
                </Button>
              </li>
            </Fragment>
          )
        })}
      </ul>
      <button
        className="group/button flex h-8 w-full items-center gap-3.5 border-t border-input px-2.5 text-sm text-foreground-subtlest transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        type="button"
        onClick={onAdd}
      >
        <FolderPlus className="size-4 group-hover/button:text-foreground" strokeWidth={1.5} />
        {t('project.additionalDirs.add')}
      </button>
    </div>
  )
}
