import { CalendarPlus } from 'lucide-react'

import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const cronCreateRenderer: ToolRenderer = {
  icon: CalendarPlus,
  label: 'tools.CronCreate.label',
  description: 'tools.cronCreate.description',
  summary: (input) => pickString(input, ['prompt', 'cron']),
  inputView: () => null,
  hasBody: () => false,
}
