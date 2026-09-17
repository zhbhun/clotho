import { BookOpen } from 'lucide-react'

import { HeightCollapsible } from './shared/content'
import type { ToolRenderer } from './shared/types'
import { formatBytes, formatMs, pickString, recordValue } from './shared/utils'

export const webFetchRenderer: ToolRenderer = {
  icon: BookOpen,
  label: 'tools.WebFetch.label',
  description: 'tools.webFetch.description',
  summary: (input) => pickString(input, ['url']),
  inputView: () => null,
  hasBody: (_input, _result, _images, toolUseResult) =>
    Boolean(extractWebFetchContent(toolUseResult)),
  bodyView: (_input, _result, _images, toolUseResult) => (
    <WebFetchBody toolUseResult={toolUseResult} />
  ),
  footerView: (_input, _result, _images, toolUseResult) => (
    <WebFetchFooter toolUseResult={toolUseResult} />
  ),
  floatingFooter: true,
}

function extractWebFetchContent(toolUseResult: unknown): string {
  const result = recordValue(toolUseResult).result
  return typeof result === 'string' ? result : ''
}

function WebFetchBody({ toolUseResult }: { toolUseResult?: unknown }) {
  const content = extractWebFetchContent(toolUseResult)
  if (!content) return null
  return <HeightCollapsible text={content} edgeOverlay />
}

function WebFetchFooter({ toolUseResult }: { toolUseResult?: unknown }) {
  const value = recordValue(toolUseResult)
  const duration = typeof value.durationMs === 'number' ? formatMs(value.durationMs) : ''
  const bytes = typeof value.bytes === 'number' ? formatBytes(value.bytes) : ''
  const text = [duration, bytes].filter(Boolean).join(' · ')
  if (!text) return null

  return (
    <div className="flex justify-end text-xs tabular-nums text-foreground-subtlest">{text}</div>
  )
}
