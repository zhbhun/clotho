import { ClipboardCopy } from 'lucide-react'

import type { ToolRenderer } from './shared/types'

export const enterPlanModeRenderer: ToolRenderer = {
  icon: ClipboardCopy,
  label: 'tools.EnterPlanMode.label',
  description: 'tools.enterPlanMode.description',
  summary: (_input, _result, _toolUseResult, t) => t?.('tools.plan.entered') ?? '',
  inputView: () => null,
  hasBody: () => false,
}
