import { FileDiff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { relativeDisplayPath } from '../tools/shared/file-path'
import type { TurnFileChange } from './file-changes'

/** Directory part dim, file name bright — mirrors the diff-stat row accent. */
function splitDisplayPath(displayPath: string): { dir: string; name: string } {
  const index = displayPath.lastIndexOf('/')
  if (index < 0) return { dir: '', name: displayPath }
  return { dir: displayPath.slice(0, index + 1), name: displayPath.slice(index + 1) }
}

/**
 * Turn-end record of the files the turn's edits touched: one header line plus
 * per-file churn (+additions / -deletions).
 */
export function FileChangesCard({
  className,
  files,
  projectPath,
}: {
  className?: string
  files: TurnFileChange[]
  projectPath?: string
}) {
  const { t } = useTranslation()
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string

  return (
    <div
      className={cn('overflow-hidden rounded-lg border border-border', className)}
      data-slot="file-changes-card"
    >
      <div className="flex items-center gap-2.5 border-b border-border bg-muted/50 px-3 py-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-background">
          <FileDiff aria-hidden className="size-4 text-foreground-subtle" />
        </span>
        <span className="text-sm font-medium text-foreground">
          {translate('workbench.conversation.editedFiles', { count: files.length })}
        </span>
      </div>
      <ul className="flex flex-col">
        {files.map((file) => {
          const { dir, name } = splitDisplayPath(relativeDisplayPath(file.path, projectPath))
          return (
            <li className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm" key={file.path}>
              <span className="min-w-0 flex-1 truncate">
                <span className="text-foreground-subtlest">{dir}</span>
                <span className="text-foreground">{name}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">+{file.additions}</span>{' '}
                <span className="text-rose-600 dark:text-rose-400">-{file.deletions}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
