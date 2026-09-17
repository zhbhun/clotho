import { useEffect, useMemo, useState } from 'react'

import {
  type ClaudeWorkflowRun,
  type ClaudeWorkflowStatus,
  claude,
} from '../../../services/claude/claude'
import { parseWorkflowLaunch } from '../../../services/claude/workflow'
import type { ClaudeMessage } from './services/message'

export interface WorkflowRef {
  runId: string
  toolUseId: string
  taskId?: string
  workflowName?: string
  summary?: string
  script?: string
}

export interface UseWorkflowsResult {
  refs: WorkflowRef[]
  runs: Record<string, ClaudeWorkflowRun>
}

const WORKFLOW_TOOL_NAMES = new Set(['Workflow', 'WorkflowTool'])
const POLL_INTERVAL_MS = 1_000

export function workflowRefsFromMessages(messages: ClaudeMessage[]): WorkflowRef[] {
  const uses = new Map<string, { script?: string }>()
  const refs = new Map<string, WorkflowRef>()

  for (const message of messages) {
    for (const block of message.blocks ?? []) {
      if (
        block.type === 'tool_use' &&
        block.toolUseId &&
        WORKFLOW_TOOL_NAMES.has(block.name ?? '')
      ) {
        uses.set(block.toolUseId, { script: parseWorkflowLaunch({ input: block.input }).script })
        continue
      }

      if (block.type !== 'tool_result' || !block.toolUseId || !uses.has(block.toolUseId)) continue
      const launch = parseWorkflowLaunch({
        input: uses.get(block.toolUseId),
        result: block.content,
        toolUseResult: block.toolUseResult,
      })
      const { runId } = launch
      if (!runId) continue
      refs.set(runId, {
        runId,
        toolUseId: block.toolUseId,
        taskId: launch.taskId,
        workflowName: launch.workflowName,
        summary: launch.summary,
        script: launch.script,
      })
    }
  }

  return Array.from(refs.values())
}

function isTerminal(status: ClaudeWorkflowStatus | undefined) {
  return status === 'completed' || status === 'failed' || status === 'stopped'
}

function workflowTerminalStatuses(
  messages: ClaudeMessage[],
  refs: WorkflowRef[],
): Map<string, ClaudeWorkflowStatus> {
  const runIdsByToolUseId = new Map(refs.map((ref) => [ref.toolUseId, ref.runId]))
  const statuses = new Map<string, ClaudeWorkflowStatus>()
  for (const message of messages) {
    const notification = message.taskNotification
    if (!notification?.toolUseId) continue
    const runId = runIdsByToolUseId.get(notification.toolUseId)
    if (runId) statuses.set(runId, notification.status)
  }
  return statuses
}

export function useWorkflows({
  isActive,
  messages,
  projectId,
  sessionId,
}: {
  isActive: boolean
  isMockProject: boolean
  messages: ClaudeMessage[]
  projectId?: string
  sessionId?: string
}): UseWorkflowsResult {
  const refs = useMemo(() => workflowRefsFromMessages(messages), [messages])
  const terminalStatuses = useMemo(() => workflowTerminalStatuses(messages, refs), [messages, refs])
  const runIdsKey = refs.map((ref) => ref.runId).join('\u0000')
  const terminalStatusesKey = refs
    .map((ref) => `${ref.runId}:${terminalStatuses.get(ref.runId) ?? ''}`)
    .join('\u0000')
  const scopeKey = `${projectId ?? ''}:${sessionId ?? ''}:${runIdsKey}`
  const [state, setState] = useState<{
    scopeKey: string
    runs: Record<string, ClaudeWorkflowRun>
  }>({ scopeKey, runs: {} })

  useEffect(() => {
    let isCurrent = true
    let pollTimer: number | undefined
    const runIds = refs.map((ref) => ref.runId)
    const knownRuns = new Map(
      state.scopeKey === scopeKey
        ? Object.values(state.runs).map((run) => [run.runId, run] as const)
        : [],
    )

    if (state.scopeKey !== scopeKey) setState({ scopeKey, runs: {} })
    if (!isActive || !sessionId || !projectId || !runIds.length) {
      return () => {
        isCurrent = false
      }
    }

    const scheduleNextRead = () => {
      if (!isCurrent) return
      pollTimer = window.setTimeout(readRuns, POLL_INTERVAL_MS)
    }
    const readRuns = async () => {
      try {
        const loadedRuns = await claude.getWorkflowRuns(sessionId, projectId, runIds)
        if (!isCurrent) return
        for (const run of loadedRuns) knownRuns.set(run.runId, run)
        for (const ref of refs) {
          if (!knownRuns.has(ref.runId)) {
            knownRuns.set(ref.runId, {
              runId: ref.runId,
              taskId: ref.taskId,
              workflowName: ref.workflowName,
              summary: ref.summary,
              status: 'running',
              isPartial: true,
              phases: [],
              agents: [],
            })
          }
          const status = terminalStatuses.get(ref.runId)
          if (!status) continue
          const current = knownRuns.get(ref.runId)
          knownRuns.set(ref.runId, {
            ...(current ?? {
              runId: ref.runId,
              isPartial: true,
              phases: [],
              agents: [],
            }),
            status,
          })
        }
        setState({ scopeKey, runs: Object.fromEntries(knownRuns) })
        if (
          runIds.some((runId) => {
            const run = knownRuns.get(runId)
            return run?.isPartial || !isTerminal(run?.status)
          })
        ) {
          scheduleNextRead()
        }
      } catch {
        if (isCurrent) scheduleNextRead()
      }
    }

    void readRuns()
    return () => {
      isCurrent = false
      if (pollTimer !== undefined) window.clearTimeout(pollTimer)
    }
    // `scopeKey` contains the primitive run id list and prevents timer churn on message identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, projectId, scopeKey, sessionId, terminalStatusesKey])

  return {
    refs,
    runs: state.scopeKey === scopeKey ? state.runs : {},
  }
}
