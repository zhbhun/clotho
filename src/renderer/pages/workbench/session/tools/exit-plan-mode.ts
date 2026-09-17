import type { TFunction } from 'i18next'
import { ClipboardPaste } from 'lucide-react'

import type { ToolRenderer } from './shared/types'
import { recordValue } from './shared/utils'

export const exitPlanModeRenderer: ToolRenderer = {
  icon: ClipboardPaste,
  label: 'tools.ExitPlanMode.label',
  description: 'tools.exitPlanMode.description',
  summary: (_input, result, toolUseResult, t) => exitPlanModeStatus(toolUseResult, result, t),
  inputView: () => null,
  hasBody: () => false,
}

function exitPlanModeStatus(toolUseResult: unknown, result?: string, t?: TFunction): string {
  const toolResult = recordValue(toolUseResult)
  const values = ['behavior', 'status', 'decision', 'result']
    .map((key) => toolResult[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')

  const combined = `${values} ${result ?? ''}`.toLowerCase()
  if (/\b(deny|denied|reject|rejected|refuse|refused)\b/.test(combined))
    return t?.('tools.plan.denied') ?? ''
  if (/\b(allow|allowed|approve|approved|accept|accepted)\b/.test(combined))
    return t?.('tools.plan.allowed') ?? ''
  if ('filePath' in toolResult || 'plan' in toolResult || 'isAgent' in toolResult)
    return t?.('tools.plan.allowed') ?? ''
  return ''
}
