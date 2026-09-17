import { BookSearch, ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ToolRenderer } from './shared/types'
import { pickString, recordValue } from './shared/utils'

export const webSearchRenderer: ToolRenderer = {
  icon: BookSearch,
  label: 'tools.WebSearch.label',
  description: 'tools.webSearch.description',
  summary: (input) => pickString(input, ['query']),
  inputView: () => null,
  hasBody: (_input, _result, _images, toolUseResult) =>
    Array.isArray(recordValue(toolUseResult).results),
  bodyView: (_input, _result, _images, toolUseResult) => (
    <WebSearchResultList toolUseResult={toolUseResult} />
  ),
  footerView: (_input, _result, _images, toolUseResult) => (
    <WebSearchFooter toolUseResult={toolUseResult} />
  ),
  floatingFooter: true,
}

function extractWebSearchResults(toolUseResult: unknown): { title?: string; url: string }[] {
  const results = recordValue(toolUseResult).results
  if (!Array.isArray(results)) return []

  return results
    .filter((result): result is Record<string, unknown> =>
      Boolean(result && typeof result === 'object'),
    )
    .map((result) => ({
      title: typeof result.title === 'string' ? result.title : '',
      url: typeof result.url === 'string' ? result.url : '',
    }))
    .filter((result) => result.url)
}

function WebSearchResultList({ toolUseResult }: { toolUseResult?: unknown }) {
  const { t } = useTranslation()
  const results = extractWebSearchResults(toolUseResult)
  if (!results.length) {
    return <div className="text-xs text-foreground-subtlest">{t('tools.webSearch.empty')}</div>
  }

  return (
    <ul className="flex flex-col gap-1">
      {results.map((item, index) => (
        <li key={`${item.url}-${index}`} className="flex min-w-0 items-center gap-1.5">
          <ExternalLink className="size-3 shrink-0 text-foreground-subtlest" />
          <a
            className="truncate text-foreground-subtlest transition-colors hover:text-foreground hover:underline"
            href={item.url}
            rel="noreferrer"
            target="_blank"
          >
            {item.title || item.url}
          </a>
        </li>
      ))}
    </ul>
  )
}

function WebSearchFooter({ toolUseResult }: { toolUseResult?: unknown }) {
  const { t } = useTranslation()
  const value = recordValue(toolUseResult)
  const duration = typeof value.durationSeconds === 'number' ? `${value.durationSeconds}s` : ''
  const count =
    typeof value.searchCount === 'number'
      ? t('tools.webSearch.resultCount', { count: value.searchCount })
      : ''
  const text = [duration, count].filter(Boolean).join(' · ')
  if (!text) return null

  return (
    <div className="flex justify-end text-xs tabular-nums text-foreground-subtlest">{text}</div>
  )
}
