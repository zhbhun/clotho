import type { LucideIcon } from 'lucide-react'

import type { ToolRenderer } from './types'
import { pickString } from './utils'

export function taskMutationRenderer(
  label: string,
  description: string,
  icon: LucideIcon,
): ToolRenderer {
  return {
    icon,
    label,
    description,
    summary: (input) =>
      pickString(input, ['subject', 'description', 'taskId', 'task_id', 'prompt', 'query']),
    inputView: () => null,
  }
}
