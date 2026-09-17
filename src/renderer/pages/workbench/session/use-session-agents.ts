import { useMemo } from 'react'

import type { ClaudeMessage } from './services/message'
import { type UseSubagentsResult, type WorkflowSubagentGroup, useSubagents } from './use-subagents'
import { type UseWorkflowsResult, useWorkflows } from './use-workflows'

export interface SessionAgentsView {
  /** Messages of the viewed scope: the opened subagent conversation, otherwise the root conversation. */
  activeMessages: ClaudeMessage[]
  /** Key of the viewed scope: 'root' or the opened subagent's toolUseId. */
  activeViewKey: string
  subagentView: UseSubagentsResult
  workflowGroups: WorkflowSubagentGroup[]
  workflowView: UseWorkflowsResult
}

/** Aggregate workflow runs and subagents into the session's agent view state. */
export function useSessionAgents({
  claudeSessionId,
  isActive,
  isMockProject,
  messages,
  projectId,
  rootMessages,
}: {
  claudeSessionId?: string
  isActive: boolean
  isMockProject: boolean
  messages: ClaudeMessage[]
  projectId?: string
  rootMessages: ClaudeMessage[]
}): SessionAgentsView {
  const workflowView = useWorkflows({
    isActive,
    isMockProject,
    messages: rootMessages,
    projectId,
    sessionId: claudeSessionId,
  })
  const workflowGroups = useMemo(
    () =>
      workflowView.refs.flatMap((ref) => {
        const run = workflowView.runs[ref.runId]
        if (!run) return []
        return [
          {
            runId: run.runId,
            name: run.workflowName ?? ref.workflowName ?? run.runId,
            summary: run.summary ?? ref.summary,
            status: run.status,
            toolUseId: ref.toolUseId,
            startedAt: run.startTime,
            agents: run.agents.flatMap((agent) =>
              agent.agentId
                ? [
                    {
                      agentId: agent.agentId,
                      label: agent.label,
                      prompt: agent.promptPreview,
                      startedAt: agent.startedAt,
                      state: agent.state,
                    },
                  ]
                : [],
            ),
          },
        ]
      }),
    [workflowView.refs, workflowView.runs],
  )
  const subagentView = useSubagents({
    isMockProject,
    messages,
    projectId,
    sessionId: claudeSessionId,
    workflowGroups,
  })
  const activeMessages = subagentView.selectedSubagent
    ? subagentView.selectedMessages
    : rootMessages
  const activeViewKey = subagentView.selectedSubagent?.toolUseId ?? 'root'
  return { activeMessages, activeViewKey, subagentView, workflowGroups, workflowView }
}
