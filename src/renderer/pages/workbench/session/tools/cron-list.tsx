import { CalendarClock } from 'lucide-react'

import { HeightCollapsible } from './shared/content'
import { extractCronJobs } from './shared/task'
import type { ToolRenderer } from './shared/types'

export const cronListRenderer: ToolRenderer = {
  icon: CalendarClock,
  label: 'tools.CronList.label',
  description: 'tools.cronList.description',
  summary: (_input, _result, toolUseResult, t) => {
    if (!toolUseResult) return ''
    const count = extractCronJobs(toolUseResult).length
    return t?.('tools.cron.jobCount', { count }) ?? ''
  },
  inputView: () => null,
  hasBody: (_input, result) => Boolean(result),
  bodyView: (_input, result) => <HeightCollapsible text={result ?? ''} mono edgeOverlay />,
}
