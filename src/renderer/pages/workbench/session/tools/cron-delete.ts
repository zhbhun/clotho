import { CalendarX2 } from 'lucide-react'

import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const cronDeleteRenderer: ToolRenderer = {
  icon: CalendarX2,
  label: 'tools.CronDelete.label',
  description: 'tools.cronDelete.description',
  summary: (input) => pickString(input, ['id']),
  inputView: () => null,
  hasBody: () => false,
}
