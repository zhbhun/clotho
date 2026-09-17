import { type ReactNode, createContext, useContext, useMemo } from 'react'

import type { ClaudeWorkflowRun } from '../../../services/claude/claude'
import type { WorkflowSubagentTarget } from './use-subagents'
import type { WorkflowRef } from './use-workflows'

interface WorkflowContextValue {
  refs: WorkflowRef[]
  runs: Record<string, ClaudeWorkflowRun>
  onOpenAgent?: (target: WorkflowSubagentTarget) => void
}

const WorkflowContext = createContext<WorkflowContextValue>({ refs: [], runs: {} })

export function WorkflowProvider({
  children,
  onOpenAgent,
  refs,
  runs,
}: WorkflowContextValue & { children: ReactNode }) {
  const value = useMemo(() => ({ refs, runs, onOpenAgent }), [onOpenAgent, refs, runs])
  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>
}

export function useWorkflowContext() {
  return useContext(WorkflowContext)
}
