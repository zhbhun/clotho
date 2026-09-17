import { ListPlus } from 'lucide-react'

import { taskMutationRenderer } from './shared/task-mutation'

export const taskCreateRenderer = taskMutationRenderer(
  'tools.TaskCreate.label',
  'tools.taskCreate.description',
  ListPlus,
)
