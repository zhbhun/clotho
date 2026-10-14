import { FileScan } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { requestFromDesktop } from '../../../../services/desktop/client'
import { ToolHeading, ToolIcon } from './shared/content'
import { fileSummary, formatDisplayPath, relativeDisplayPath } from './shared/file-path'
import type { CoalescedRead, ToolRenderer } from './shared/types'

export const readRenderer: ToolRenderer = {
  icon: FileScan,
  label: 'tools.Read.label',
  description: 'tools.read.description',
  summary: (input) => fileSummary(input),
  inputView: () => null,
  hasBody: () => false,
  itemView: ({ coalescedReads, projectPath }) =>
    coalescedReads?.length ? (
      <ReadCoalescedCard projectPath={projectPath} reads={coalescedReads} />
    ) : null,
}

export function ReadCoalescedCard({
  reads,
  projectPath,
}: {
  reads: CoalescedRead[]
  projectPath?: string
}) {
  const { t } = useTranslation()
  const translate = t as unknown as (key: string) => string
  return (
    <div className="flex max-w-full flex-col gap-0.5 leading-6">
      {reads.map((read, index) => {
        const summary = summarizeRead(read, projectPath)
        return (
          <div
            key={`${read.file_path}-${index}`}
            aria-label={[translate(readRenderer.label), summary].filter(Boolean).join(' · ')}
            className="inline-flex max-w-full items-center gap-1.5"
          >
            <ToolIcon
              className="text-foreground-subtlest"
              description={translate(readRenderer.description)}
              icon={readRenderer.icon}
            />
            <ToolHeading
              name={translate(readRenderer.label)}
              summary={
                <ReadPathLink path={read.file_path} projectPath={projectPath}>
                  {summary}
                </ReadPathLink>
              }
            />
          </div>
        )
      })}
    </div>
  )
}

/**
 * Reveals the read file in the system file manager. The href is the
 * project-relative path so the main-process link guard accepts it; files
 * outside the project resolve to "ignore" there and the click is a no-op.
 */
function ReadPathLink({
  path,
  projectPath,
  children,
}: {
  path: string
  projectPath?: string
  children: ReactNode
}) {
  return (
    <span
      className="cursor-pointer underline-offset-2 hover:text-foreground hover:underline"
      onClick={() => {
        if (!projectPath) return
        void requestFromDesktop('appOpenLink', {
          href: relativeDisplayPath(path, projectPath),
          projectPath,
        }).catch(() => undefined)
      }}
    >
      {children}
    </span>
  )
}

function summarizeRead(read: CoalescedRead, projectPath?: string): string {
  const path = formatDisplayPath(read.file_path, projectPath)
  const range = readLineRange(read)
  return range ? `${path}:${range.start}:${range.end}` : path
}

function readLineRange(read: CoalescedRead): { start: number; end: number } | null {
  if (typeof read.limit !== 'number') return null
  const start = typeof read.offset === 'number' ? read.offset : 1
  const end = start + read.limit - 1
  if (end < start) return null
  return { start, end }
}
