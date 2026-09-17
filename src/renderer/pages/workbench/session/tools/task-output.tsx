import { ScrollText } from 'lucide-react'

import { TaskOutputTranscript } from './shared/task-output'
import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const taskOutputRenderer: ToolRenderer = {
  icon: ScrollText,
  label: 'tools.TaskOutput.label',
  description: 'tools.taskOutput.description',
  summary: (input) => pickString(input, ['task_id', 'taskId', 'id']),
  inputView: () => null,
  bodyView: (input, result) => (
    <TaskOutputTranscript taskId={pickString(input, ['task_id', 'taskId', 'id'])} result={result} />
  ),
}
