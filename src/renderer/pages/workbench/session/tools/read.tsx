import { FileScan } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { ToolIcon } from './shared/content'
import { fileSummary, formatDisplayPath } from './shared/file-path'
import type { CoalescedRead, ToolRenderer } from './shared/types'

export const readRenderer: ToolRenderer = {
  icon: FileScan,
  label: 'tools.Read.label',
  description: 'tools.read.description',
  summary: (input) => fileSummary(input),
  inputView: () => null,
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
            aria-label={[translate(readRenderer.label), summary].filter(Boolean).join(' ')}
            className="inline-flex max-w-full items-center gap-1.5"
          >
            <ToolIcon
              className="text-foreground-subtlest"
              description={translate(readRenderer.description)}
              icon={readRenderer.icon}
            />
            {summary ? (
              <span className="truncate font-mono text-foreground-subtlest">{summary}</span>
            ) : null}
          </div>
        )
      })}
    </div>
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
