import { Bot } from 'lucide-react'

import type { ToolRenderer } from './shared/types'
import { pickString } from './shared/utils'

function agentSummary(input: unknown): string {
  return [
    pickString(input, ['subagent_type', 'agent_type']),
    pickString(input, ['description', 'prompt']),
  ]
    .filter(Boolean)
    .join(' ')
}

function agentId(toolUseResult: unknown): string {
  return pickString(toolUseResult, ['agentId', 'agent_id'])
}

export const agentRenderer: ToolRenderer = {
  icon: Bot,
  label: 'tools.Agent.label',
  description: 'tools.agent.description',
  summary: agentSummary,
  inputView: () => null,
  hasBody: (_input, result, _images, toolUseResult, isError) =>
    Boolean(result && isError && !agentId(toolUseResult)),
  opensSubagent: true,
  canOpenSubagent: (toolUseResult, isError) => !isError || Boolean(agentId(toolUseResult)),
}
