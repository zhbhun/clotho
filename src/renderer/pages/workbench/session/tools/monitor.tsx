import { Radar } from 'lucide-react'

import { BackgroundTaskTranscript } from './shared/command'
import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

export const monitorRenderer: ToolRenderer = {
  icon: Radar,
  label: 'tools.Monitor.label',
  description: 'tools.monitor.description',
  summary: (input) => pickString(input, ['description', 'command']),
  inputView: () => null,
  bodyItemView: ({ input, backgroundTask }) => (
    <BackgroundTaskTranscript command={pickString(input, ['command'])} task={backgroundTask} />
  ),
}
