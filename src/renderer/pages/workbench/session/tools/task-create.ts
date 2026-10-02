import { ListPlus } from 'lucide-react'

import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

/**
 * Row shown only while a TaskCreate executes; the committed call folds into a
 * task card (see conversation/task-items.ts), so the row never has a body.
 */
export const taskCreateRenderer: ToolRenderer = {
  icon: ListPlus,
  label: 'tools.TaskCreate.label',
  description: 'tools.taskCreate.description',
  summary: (input) => pickString(input, ['subject', 'description']),
  inputView: () => null,
  hasBody: () => false,
}
