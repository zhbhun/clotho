import { FilePenLine } from 'lucide-react'

import { cn } from '@/shadcn/utils'

import { fileName, fileSummary } from './shared/file-path'
import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const editRenderer: ToolRenderer = {
  icon: FilePenLine,
  label: 'tools.Edit.label',
  description: 'tools.edit.description',
  summary: (input) => fileSummary(input),
  inputView: (input) => <EditInput file={pickString(input, ['file_path', 'path'])} input={input} />,
  bodyView: (input) => <EditInput file={pickString(input, ['file_path', 'path'])} input={input} />,
  flushBody: true,
}

function EditInput({ file, input }: { file: string; input: unknown }) {
  const value = (input ?? {}) as Record<string, unknown>
  const oldValue = typeof value.old_string === 'string' ? value.old_string : ''
  const newValue = typeof value.new_string === 'string' ? value.new_string : ''
  return <GitDiffPreview file={file} oldValue={oldValue} newValue={newValue} />
}

function GitDiffPreview({
  file,
  oldValue,
  newValue,
}: {
  file: string
  oldValue: string
  newValue: string
}) {
  if (!oldValue && !newValue) return null

  const oldLines = diffPreviewLines(oldValue)
  const newLines = diffPreviewLines(newValue)
  const oldRange = diffRange(oldLines.length)
  const newRange = diffRange(newLines.length)
  const displayFile = fileName(file) || 'file'

  return (
    <div className="overflow-hidden font-mono text-xs leading-[1.5]">
      <DiffMetaLine value={`--- a/${displayFile}`} />
      <DiffMetaLine value={`+++ b/${displayFile}`} />
      <DiffMetaLine value={`@@ -${oldRange} +${newRange} @@`} />
      {oldLines.map((line, index) => (
        <DiffLine key={`old-${index}`} sign="-" tone="removed" value={line} />
      ))}
      {newLines.map((line, index) => (
        <DiffLine key={`new-${index}`} sign="+" tone="added" value={line} />
      ))}
    </div>
  )
}

function DiffMetaLine({ value }: { value: string }) {
  return <div className="px-2 text-foreground-subtlest">{value}</div>
}

function DiffLine({
  sign,
  tone,
  value,
}: {
  sign: '-' | '+'
  tone: 'removed' | 'added'
  value: string
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[1.75rem_minmax(0,1fr)] border-l-2 px-2',
        tone === 'removed' &&
          'border-rose-500/60 bg-rose-500/10 text-rose-700/90 dark:text-rose-300/90',
        tone === 'added' &&
          'border-emerald-500/60 bg-emerald-500/10 text-emerald-700/90 dark:text-emerald-300/90',
      )}
    >
      <span className="select-none text-center text-foreground-subtlest">{sign} </span>
      <span className="whitespace-pre-wrap break-words">{value}</span>
    </div>
  )
}

function diffRange(lineCount: number): string {
  if (lineCount <= 1) return '1'
  return `1,${lineCount}`
}

function diffPreviewLines(value: string): string[] {
  if (!value) return []
  const lines = value.split('\n')
  const preview = lines.slice(0, 6)
  if (lines.length > preview.length) preview.push('…')
  return preview
}
