import { FileDiff } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { useWorkbenchStore } from '../../stores/workbench-store'
import { changeDisplayPath } from './change-path'
import { ChangePath } from './change-path-label'
import type { TurnFileChange } from './file-changes'

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
  const homePath = useWorkbenchStore(
    (state) => Object.values(state.projects).find((project) => project.is_home)?.path,
  )
  const translate = t as unknown as (key: string, options?: Record<string, unknown>) => string

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border-chat-reply [@media(min-resolution:2dppx)]:border-[0.5px]',
        className,
      )}
      data-slot="file-changes-card"
    >
      <div className="flex items-center gap-2.5 border-b border-border-chat-reply bg-chat-reply px-3 py-2.5 [@media(min-resolution:2dppx)]:border-b-[0.5px]">
        <FileDiff aria-hidden className="size-4 shrink-0 text-foreground-subtle" />
        <span className="text-sm text-foreground">
          {translate('workbench.conversation.editedFiles', { count: files.length })}
        </span>
      </div>
      <ul className="flex flex-col">
        {files.map((file) => {
          const fullPath = /^(?:\/|[A-Za-z]:[\\/])/.test(file.path)
            ? file.path
            : projectPath
              ? `${projectPath.replace(/[\\/]+$/, '')}/${file.path}`
              : file.path
          return (
            <li className="flex min-w-0 items-center gap-3 px-3 py-2 text-sm" key={file.path}>
              <ChangePath
                path={changeDisplayPath(file.path, projectPath, homePath)}
                fullPath={fullPath}
              />
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
