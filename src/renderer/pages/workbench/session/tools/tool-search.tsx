import { TextSearch } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ToolRenderer } from './shared/types'
import { mcpToolName, pickString, recordValue } from './shared/utils'

function extractMatches(toolUseResult: unknown): string[] {
  const matches = recordValue(toolUseResult).matches
  if (!Array.isArray(matches)) return []
  return matches.filter((match): match is string => typeof match === 'string' && Boolean(match))
}

export const toolSearchRenderer: ToolRenderer = {
  icon: TextSearch,
  label: 'tools.ToolSearch.label',
  description: 'tools.toolSearch.description',
  summary: (input) => pickString(input, ['query']),
  inputView: () => null,
  hasBody: (_input, _result, _images, toolUseResult) =>
    Array.isArray(recordValue(toolUseResult).matches),
  bodyView: (_input, _result, _images, toolUseResult) => (
    <ToolMatchList toolUseResult={toolUseResult} />
  ),
  footerView: (_input, _result, _images, toolUseResult) => (
    <ToolSearchFooter toolUseResult={toolUseResult} />
  ),
  floatingFooter: true,
}

function ToolMatchList({ toolUseResult }: { toolUseResult?: unknown }) {
  const { t } = useTranslation()
  const matches = extractMatches(toolUseResult)
  if (!matches.length) {
    return <div className="text-xs text-foreground-subtlest">{t('tools.toolSearch.empty')}</div>
  }

  return (
    <ul className="flex flex-col gap-1">
      {matches.map((match, index) => (
        <li
          key={`${match}-${index}`}
          className="truncate font-mono text-xs text-foreground-subtlest"
        >
          {mcpToolName(match)}
        </li>
      ))}
    </ul>
  )
}

function ToolSearchFooter({ toolUseResult }: { toolUseResult?: unknown }) {
  const { t } = useTranslation()
  const count = extractMatches(toolUseResult).length
  if (!count) return null

  return (
    <div className="flex justify-end text-xs tabular-nums text-foreground-subtlest">
      {t('tools.toolSearch.resultCount', { count })}
    </div>
  )
}
