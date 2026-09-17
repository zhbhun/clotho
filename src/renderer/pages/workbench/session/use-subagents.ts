import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  type ClaudeSubagent,
  type ClaudeWorkflowStatus,
  claude,
} from '../../../services/claude/claude'
import { type ClaudeMessage, claudeJsonToMessage } from './services/message'
import {
  type SessionSubagent,
  type SessionWorkflow,
  buildSessionSubagents,
  mergeSubagentMessages,
  prependSubagentPrompt,
} from './subagents'

export interface UseSubagentsResult {
  closeSubagent: () => void
  error: string | null
  isLoading: boolean
  openSubagent: (toolUseId: string) => void
  openWorkflowSubagent: (target: WorkflowSubagentTarget) => void
  retry: () => void
  selectSubagent: (subagent: SessionSubagent) => void
  selectedMessages: ClaudeMessage[]
  selectedSubagent?: SessionSubagent
  subagents: SessionSubagent[]
  workflows: SessionWorkflow[]
}

export interface WorkflowSubagentTarget {
  agentId: string
  label: string
  prompt?: string
  startedAt?: number
  state?: string
}

export interface WorkflowSubagentGroup {
  runId: string
  name: string
  summary?: string
  status?: ClaudeWorkflowStatus
  toolUseId: string
  startedAt?: number
  agents: WorkflowSubagentTarget[]
}

type SubagentHistory = {
  error: string | null
  messages: ClaudeMessage[]
  status: 'loading' | 'loaded' | 'error'
}

const INDEX_RETRY_DELAYS_MS = [0, 150, 300]
const EMPTY_WORKFLOW_GROUPS: WorkflowSubagentGroup[] = []
const SUBAGENT_LOAD_ERROR_KEY = 'workbench.subagent.loadError'
const SUBAGENT_LOG_NOT_READY_KEY = 'workbench.subagent.logNotReady'

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function errorMessage(caught: unknown): string {
  return caught instanceof Error ? caught.message : SUBAGENT_LOAD_ERROR_KEY
}

function mergeSubagentIndex(current: ClaudeSubagent[], incoming: ClaudeSubagent[]) {
  const merged = new Map(current.map((subagent) => [subagent.toolUseId, subagent]))
  for (const subagent of incoming) merged.set(subagent.toolUseId, subagent)
  return Array.from(merged.values())
}

function workflowSubagentStatus(state?: string): SessionSubagent['status'] {
  if (state === 'done' || state === 'completed') return 'completed'
  if (state === 'failed' || state === 'error') return 'failed'
  if (state === 'stopped' || state === 'cancelled' || state === 'aborted') return 'stopped'
  if (state === 'running' || state === 'in_progress') return 'running'
  return 'unknown'
}

function workflowSessionSubagent(target: WorkflowSubagentTarget): SessionSubagent | null {
  if (!target.agentId) return null
  return {
    id: target.agentId,
    agentType: 'workflow-subagent',
    description: target.label,
    toolUseId: `workflow-agent:${target.agentId}`,
    spawnDepth: 1,
    createdAt: target.startedAt ? new Date(target.startedAt).toISOString() : '',
    status: workflowSubagentStatus(target.state),
    prompt: target.prompt,
  }
}

export function useSubagents({
  isMockProject,
  messages,
  projectId,
  sessionId,
  workflowGroups = EMPTY_WORKFLOW_GROUPS,
}: {
  isMockProject: boolean
  messages: ClaudeMessage[]
  projectId?: string
  sessionId?: string
  workflowGroups?: WorkflowSubagentGroup[]
}): UseSubagentsResult {
  const { t } = useTranslation()
  const [index, setIndex] = useState<ClaudeSubagent[]>([])
  const [openedWorkflowSubagents, setOpenedWorkflowSubagents] = useState<SessionSubagent[]>([])
  const [histories, setHistories] = useState<Record<string, SubagentHistory>>({})
  const [selectedToolUseId, setSelectedToolUseId] = useState<string>()
  const scopeKey = `${isMockProject ? 'mock' : 'desktop'}:${projectId ?? ''}:${sessionId ?? ''}`
  const renderedScopeKeyRef = useRef(scopeKey)
  const resetScopeKeyRef = useRef(scopeKey)
  const scopeGenerationRef = useRef(0)
  if (renderedScopeKeyRef.current !== scopeKey) {
    renderedScopeKeyRef.current = scopeKey
    scopeGenerationRef.current += 1
  }

  useEffect(() => {
    if (resetScopeKeyRef.current !== scopeKey) {
      resetScopeKeyRef.current = scopeKey
      setIndex([])
      setOpenedWorkflowSubagents([])
      setHistories({})
      setSelectedToolUseId(undefined)
    }
    if (!sessionId || !projectId) return
    let active = true
    void claude
      .listSubagents(sessionId, projectId)
      .then((subagents) => {
        if (active) {
          const next = Array.isArray(subagents) ? subagents : []
          setIndex((current) => mergeSubagentIndex(current, next))
        }
      })
      .catch(() => {
        // Agent tool calls observed in the transcript still provide a usable fallback index.
      })
    return () => {
      active = false
    }
  }, [projectId, scopeKey, sessionId])

  const observedMessages = useMemo(
    () =>
      mergeSubagentMessages(
        messages,
        Object.values(histories).flatMap((history) => history.messages),
      ),
    [histories, messages],
  )
  const workflows = useMemo(
    () =>
      workflowGroups.map((group) => ({
        runId: group.runId,
        name: group.name,
        toolUseId: group.toolUseId,
        createdAt: group.startedAt ? new Date(group.startedAt).toISOString() : '',
        agents: group.agents.flatMap((agent) => {
          const subagent = workflowSessionSubagent(agent)
          return subagent ? [subagent] : []
        }),
      })),
    [workflowGroups],
  )
  const workflowSubagents = useMemo(() => {
    const merged = new Map(openedWorkflowSubagents.map((agent) => [agent.toolUseId, agent]))
    for (const workflow of workflows) {
      for (const subagent of workflow.agents) merged.set(subagent.toolUseId, subagent)
    }
    return Array.from(merged.values())
  }, [openedWorkflowSubagents, workflows])
  const subagents = useMemo(() => {
    const merged = new Map(
      buildSessionSubagents(index, observedMessages).map((subagent) => [
        subagent.toolUseId,
        subagent,
      ]),
    )
    for (const subagent of workflowSubagents) merged.set(subagent.toolUseId, subagent)
    return Array.from(merged.values())
  }, [index, observedMessages, workflowSubagents])
  const selectedSubagent = subagents.find((subagent) => subagent.toolUseId === selectedToolUseId)
  const selectedHistory = selectedSubagent ? histories[selectedSubagent.id] : undefined
  const selectedMessages = useMemo(() => {
    if (!selectedSubagent) return []
    const live = messages.filter(
      (message) => message.parentToolUseId === selectedSubagent.toolUseId,
    )
    return prependSubagentPrompt(
      selectedSubagent,
      mergeSubagentMessages(selectedHistory?.messages ?? [], live),
    )
  }, [messages, selectedHistory?.messages, selectedSubagent])

  const fetchSubagent = useCallback(
    (subagent: Pick<SessionSubagent, 'id'>) => {
      if (!sessionId || !projectId) return
      const requestGeneration = scopeGenerationRef.current

      setHistories((current) => ({
        ...current,
        [subagent.id]: {
          error: null,
          messages: current[subagent.id]?.messages ?? [],
          status: 'loading',
        },
      }))
      void claude
        .getSubagentMessages(sessionId, projectId, subagent.id)
        .then((lines) => {
          if (scopeGenerationRef.current !== requestGeneration) return
          const loaded = lines
            .map((line, lineIndex) => claudeJsonToMessage(line, lineIndex))
            .filter((message): message is ClaudeMessage => Boolean(message))
          setHistories((current) => ({
            ...current,
            [subagent.id]: { error: null, messages: loaded, status: 'loaded' },
          }))
        })
        .catch((caught) => {
          if (scopeGenerationRef.current !== requestGeneration) return
          setHistories((current) => ({
            ...current,
            [subagent.id]: {
              error: errorMessage(caught),
              messages: current[subagent.id]?.messages ?? [],
              status: 'error',
            },
          }))
        })
    },
    [projectId, sessionId],
  )
  const loadSubagent = useCallback(
    (subagent: SessionSubagent, force = false) => {
      const cached = histories[subagent.id]
      if (!force && (cached?.status === 'loaded' || cached?.status === 'loading')) return
      fetchSubagent(subagent)
    },
    [fetchSubagent, histories],
  )
  const selectedWorkflowStateRef = useRef<
    { id: string; status: SessionSubagent['status'] } | undefined
  >(undefined)
  const selectedWorkflowAgentId =
    selectedSubagent?.agentType === 'workflow-subagent' ? selectedSubagent.id : undefined
  const selectedWorkflowStatus =
    selectedSubagent?.agentType === 'workflow-subagent' ? selectedSubagent.status : undefined

  useEffect(() => {
    const previous = selectedWorkflowStateRef.current
    selectedWorkflowStateRef.current = selectedWorkflowAgentId
      ? { id: selectedWorkflowAgentId, status: selectedWorkflowStatus ?? 'unknown' }
      : undefined
    if (!selectedWorkflowAgentId) return

    if (selectedWorkflowStatus === 'running') {
      const timer = window.setInterval(() => fetchSubagent({ id: selectedWorkflowAgentId }), 1_000)
      return () => window.clearInterval(timer)
    }

    if (previous?.id === selectedWorkflowAgentId && previous.status === 'running') {
      fetchSubagent({ id: selectedWorkflowAgentId })
    }
  }, [fetchSubagent, selectedWorkflowAgentId, selectedWorkflowStatus])

  const resolveAndLoadSubagent = useCallback(
    async (subagent: SessionSubagent, force = false) => {
      if (!sessionId || !projectId) return
      const requestGeneration = scopeGenerationRef.current
      setHistories((current) => ({
        ...current,
        [subagent.id]: {
          error: null,
          messages: current[subagent.id]?.messages ?? [],
          status: 'loading',
        },
      }))

      try {
        for (const retryDelay of INDEX_RETRY_DELAYS_MS) {
          if (retryDelay) await delay(retryDelay)
          const response = await claude.listSubagents(sessionId, projectId)
          if (scopeGenerationRef.current !== requestGeneration) return
          const refreshedIndex = Array.isArray(response) ? response : []
          setIndex((current) => mergeSubagentIndex(current, refreshedIndex))
          const resolved = refreshedIndex.find(
            (candidate) => candidate.toolUseId === subagent.toolUseId,
          )
          if (resolved) {
            loadSubagent({ ...subagent, ...resolved }, force)
            return
          }
        }
        throw new Error(SUBAGENT_LOG_NOT_READY_KEY)
      } catch (caught) {
        if (scopeGenerationRef.current !== requestGeneration) return
        setHistories((current) => ({
          ...current,
          [subagent.id]: {
            error: errorMessage(caught),
            messages: current[subagent.id]?.messages ?? [],
            status: 'error',
          },
        }))
      }
    },
    [loadSubagent, projectId, sessionId],
  )

  const selectSubagent = useCallback(
    (subagent: SessionSubagent) => {
      setSelectedToolUseId(subagent.toolUseId)
      if (subagent.agentType === 'workflow-subagent') {
        loadSubagent(subagent, subagent.status === 'running')
        return
      }
      const indexedSubagent = index.find((candidate) => candidate.toolUseId === subagent.toolUseId)
      if (indexedSubagent) {
        loadSubagent({ ...subagent, ...indexedSubagent })
      } else {
        void resolveAndLoadSubagent(subagent)
      }
    },
    [index, loadSubagent, resolveAndLoadSubagent],
  )
  const openSubagent = useCallback(
    (toolUseId: string) => {
      const subagent = subagents.find((candidate) => candidate.toolUseId === toolUseId)
      if (subagent) selectSubagent(subagent)
    },
    [selectSubagent, subagents],
  )
  const openWorkflowSubagent = useCallback(
    (target: WorkflowSubagentTarget) => {
      const subagent = workflowSessionSubagent(target)
      if (!subagent) return
      setOpenedWorkflowSubagents((current) => [
        ...current.filter((candidate) => candidate.toolUseId !== subagent.toolUseId),
        subagent,
      ])
      selectSubagent(subagent)
    },
    [selectSubagent],
  )
  const closeSubagent = useCallback(() => setSelectedToolUseId(undefined), [])
  const retry = useCallback(() => {
    if (!selectedSubagent) return
    const indexedSubagent = index.find(
      (candidate) => candidate.toolUseId === selectedSubagent.toolUseId,
    )
    if (selectedSubagent.toolUseId.startsWith('workflow-agent:')) {
      loadSubagent(selectedSubagent, true)
    } else if (indexedSubagent) {
      loadSubagent({ ...selectedSubagent, ...indexedSubagent }, true)
    } else {
      void resolveAndLoadSubagent(selectedSubagent, true)
    }
  }, [index, loadSubagent, resolveAndLoadSubagent, selectedSubagent])

  const selectedError = selectedHistory?.error
  const localizedError =
    selectedError === SUBAGENT_LOAD_ERROR_KEY || selectedError === SUBAGENT_LOG_NOT_READY_KEY
      ? t(selectedError)
      : (selectedError ?? null)

  return {
    closeSubagent,
    error: localizedError,
    isLoading: selectedHistory?.status === 'loading',
    openSubagent,
    openWorkflowSubagent,
    retry,
    selectSubagent,
    selectedMessages,
    selectedSubagent,
    subagents,
    workflows,
  }
}
