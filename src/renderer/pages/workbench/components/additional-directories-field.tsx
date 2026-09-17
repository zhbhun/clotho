import { Folder, FolderPlus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import { ProjectPath } from '../../../components/project-path'
import { projectNameFromPath } from '../../../utils/project'

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
        className="h-8 w-full justify-start gap-3.5 border-input bg-input/20 px-2 text-foreground-subtlest hover:bg-input dark:hover:bg-input"
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
    <div className="rounded-md border border-input bg-input/20 dark:bg-input/30">
      <ul className="divide-y divide-input">
        {directories.map((directory) => {
          const name = projectNameFromPath(directory)
          return (
            <li key={directory} className="flex h-8 items-center gap-3.5 px-2">
              <Folder className="size-4 shrink-0 text-foreground-subtlest" strokeWidth={1.5} />
              <ProjectPath
                className="flex-1 font-mono text-xs text-foreground-subtlest"
                path={directory}
              />
              <Button
                aria-label={t('project.additionalDirs.remove', { name })}
                className="hover:bg-input dark:hover:bg-input"
                disabled={disabled}
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => onRemove(directory)}
              >
                <X strokeWidth={1.5} />
              </Button>
            </li>
          )
        })}
      </ul>
      <button
        className="group/button flex h-8 w-full items-center gap-3.5 border-t border-input px-2 text-sm text-foreground-subtlest transition-colors hover:bg-input disabled:pointer-events-none disabled:opacity-50"
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
