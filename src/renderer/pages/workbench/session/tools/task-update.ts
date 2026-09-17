import { ListRestart } from 'lucide-react'

import { taskMutationRenderer } from './shared/task-mutation'

export const taskUpdateRenderer = taskMutationRenderer(
  'tools.TaskUpdate.label',
  'tools.taskUpdate.description',
  ListRestart,
)
