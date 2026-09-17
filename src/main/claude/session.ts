import { promises as fs } from 'node:fs'
import path from 'node:path'

import {
  type SessionMessage,
  getSessionMessages,
  getSubagentMessages,
  listSubagents,
  forkSession as sdkForkSession,
} from '@anthropic-ai/claude-agent-sdk'

import type {
  ClaudeJsonLine,
  ClaudeSessionEditAnchor,
  ClaudeSubagent,
  ClaudeWorkflowAgent,
  ClaudeWorkflowPhase,
  ClaudeWorkflowRun,
  ClaudeWorkflowStatus,
} from '@/shared/rpc'

import type { SessionEntry } from './session-meta'
import { projectDirNameFromPath } from './sessions'
import { enrichTaskNotification } from './task-notification'
import { claudeDir, projectPathForId } from './workspace'

function entryType(entry: SessionEntry) {
  return typeof entry.type === 'string' ? entry.type : undefined
}

function entryUuid(entry: SessionEntry) {
  return typeof entry.uuid === 'string' ? entry.uuid : undefined
}

function entryParent(entry: SessionEntry) {
  return typeof entry.parentUuid === 'string' ? entry.parentUuid : undefined
}

function entryBool(entry: SessionEntry, key: string) {
  return entry[key] === true
}

export function parseSessionEntries(buffer: string) {
  return buffer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const value = JSON.parse(line) as SessionEntry
        return entryUuid(value) ? [value] : []
      } catch {
        return []
      }
    })
}

export function resolveMessageEditAnchor(
  entries: SessionEntry[],
  messageId: string,
): ClaudeSessionEditAnchor {
  const target = entries.find((entry) => entryUuid(entry) === messageId)
  if (!target || entryType(target) !== 'user') {
    throw new Error(`Cannot find user message: ${messageId}`)
  }

  const byUuid = new Map(
    entries.flatMap((entry) => {
      const uuid = entryUuid(entry)
      return uuid ? [[uuid, entry] as const] : []
    }),
  )
  const visited = new Set<string>([messageId])
  let parentUuid = entryParent(target)

  while (parentUuid) {
    if (visited.has(parentUuid)) {
      throw new Error(`Cannot resolve a cyclic transcript before user message: ${messageId}`)
    }
    visited.add(parentUuid)

    const parent = byUuid.get(parentUuid)
    if (!parent) {
      throw new Error(`Cannot find transcript parent ${parentUuid} for user message: ${messageId}`)
    }
    if (entryType(parent) === 'assistant') {
      return { strategy: 'resume', resumeSessionAt: parentUuid }
    }
    parentUuid = entryParent(parent)
  }

  return { strategy: 'fresh' }
}

export function buildMainChain(entries: SessionEntry[]) {
  if (!entries.length) {
    return []
  }

  if (!entries.some((entry) => entryParent(entry))) {
    return entries.map((_, index) => index)
  }

  const byUuid = new Map<string, number>()
  entries.forEach((entry, index) => {
    const uuid = entryUuid(entry)
    if (uuid) {
      byUuid.set(uuid, index)
    }
  })

  const parents = new Set(
    entries.map(entryParent).filter((value): value is string => Boolean(value)),
  )
  const isLeaf = (index: number) => {
    const uuid = entryUuid(entries[index])
    return uuid ? !parents.has(uuid) : false
  }
  const isConversational = (index: number) =>
    ['user', 'assistant'].includes(entryType(entries[index]) ?? '')

  let tip =
    entries
      .map((_, index) => index)
      .filter((index) => isLeaf(index) && isConversational(index))
      .at(-1) ??
    entries
      .map((_, index) => index)
      .filter(isLeaf)
      .at(-1)

  if (tip === undefined) {
    return entries.map((_, index) => index)
  }

  const chain: number[] = []
  const visited = new Set<number>()
  while (!visited.has(tip)) {
    visited.add(tip)
    chain.push(tip)
    const parent = entryParent(entries[tip])
    if (!parent) {
      break
    }
    const next = byUuid.get(parent)
    if (next === undefined) {
      break
    }
    tip = next
  }

  return chain.reverse()
}

export function finalizeChain(entries: SessionEntry[], chain: number[]) {
  return chain
    .map((index) => entries[index])
    .filter(
      (entry) =>
        !entryBool(entry, 'isMeta') &&
        !entryBool(entry, 'isSidechain') &&
        entryType(entry) !== 'system' &&
        typeof entry.teamName !== 'string',
    )
}

function sessionMessageToClaudeJsonLine(message: SessionMessage): ClaudeJsonLine {
  const entry = message as unknown as ClaudeJsonLine
  return {
    ...entry,
    type: message.type,
    uuid: message.uuid,
    session_id: message.session_id,
    message: message.message as ClaudeJsonLine['message'],
    parent_tool_use_id: message.parent_tool_use_id,
  }
}

function restoreMessageParents(
  messages: ClaudeJsonLine[],
  entries: SessionEntry[],
): ClaudeJsonLine[] {
  const messagesByUuid = new Set(
    messages.flatMap((message) => (typeof message.uuid === 'string' ? [message.uuid] : [])),
  )
  const entriesByUuid = new Map(
    entries.flatMap((entry) => {
      const uuid = entryUuid(entry)
      return uuid ? [[uuid, entry] as const] : []
    }),
  )

  return messages.map((message) => {
    const rawEntry = typeof message.uuid === 'string' ? entriesByUuid.get(message.uuid) : undefined
    let parentUuid = rawEntry ? entryParent(rawEntry) : message.parentUuid
    if (!parentUuid) return message

    const visited = new Set<string>()
    while (parentUuid && !messagesByUuid.has(parentUuid) && !visited.has(parentUuid)) {
      visited.add(parentUuid)
      const parent = entriesByUuid.get(parentUuid)
      parentUuid = parent ? entryParent(parent) : undefined
    }

    return parentUuid ? { ...message, parentUuid } : message
  })
}

function mergeLocalCommandResults(
  messages: ClaudeJsonLine[],
  entries: SessionEntry[],
): ClaudeJsonLine[] {
  const existingUuids = new Set(
    messages.flatMap((message) => (typeof message.uuid === 'string' ? [message.uuid] : [])),
  )
  const resultsByParent = new Map<string, ClaudeJsonLine[]>()

  for (const entry of entries) {
    if (
      entryType(entry) !== 'system' ||
      entry.subtype !== 'local_command' ||
      typeof entry.parentUuid !== 'string' ||
      (typeof entry.uuid === 'string' && existingUuids.has(entry.uuid))
    ) {
      continue
    }
    const results = resultsByParent.get(entry.parentUuid) ?? []
    results.push(entry as ClaudeJsonLine)
    resultsByParent.set(entry.parentUuid, results)
  }

  return messages.flatMap((message) => [
    message,
    ...(typeof message.uuid === 'string' ? (resultsByParent.get(message.uuid) ?? []) : []),
  ])
}

async function loadRawSessionEntries(sessionId: string, projectPath: string) {
  try {
    assertPathSegment(sessionId, 'session id')
    const transcriptPath = path.join(
      claudeDir(),
      'projects',
      projectDirNameFromPath(projectPath),
      `${sessionId}.jsonl`,
    )
    return parseSessionEntries(await fs.readFile(transcriptPath, 'utf8'))
  } catch {
    return []
  }
}

export async function loadSessionMessages({
  sessionId,
  projectPath,
}: {
  sessionId: string
  projectPath: string
}): Promise<ClaudeJsonLine[]> {
  const [messages, entries] = await Promise.all([
    getSessionMessages(sessionId, { dir: projectPath }),
    loadRawSessionEntries(sessionId, projectPath),
  ])
  const merged = mergeLocalCommandResults(
    messages.map((message) => sessionMessageToClaudeJsonLine(message)),
    entries,
  )
  return Promise.all(
    restoreMessageParents(merged, entries).map((message) => enrichTaskNotification(message)),
  )
}

export async function loadSessionHistory({
  sessionId,
  projectId,
}: {
  sessionId: string
  projectId: string
}) {
  return loadSessionMessages({
    sessionId,
    projectPath: await projectPathForId(projectId),
  })
}

type SubagentMeta = {
  agentType: string
  description: string
  toolUseId: string
  spawnDepth: number
}

function parseSubagentMeta(value: string): SubagentMeta {
  const meta = JSON.parse(value) as Record<string, unknown>
  if (
    typeof meta.agentType !== 'string' ||
    typeof meta.description !== 'string' ||
    typeof meta.toolUseId !== 'string' ||
    typeof meta.spawnDepth !== 'number'
  ) {
    throw new Error('Invalid subagent metadata')
  }
  return {
    agentType: meta.agentType,
    description: meta.description,
    toolUseId: meta.toolUseId,
    spawnDepth: meta.spawnDepth,
  }
}

export async function listSessionSubagents({
  sessionId,
  projectId,
}: {
  sessionId: string
  projectId: string
}): Promise<ClaudeSubagent[]> {
  assertPathSegment(projectId, 'project id')
  assertPathSegment(sessionId, 'session id')
  const projectPath = await projectPathForId(projectId)
  const agentIds = await listSubagents(sessionId, { dir: projectPath })

  const subagents = await Promise.all(
    agentIds.map(async (id) => {
      try {
        assertPathSegment(id, 'subagent id')
        const metaPath = path.join(
          claudeDir(),
          'projects',
          projectDirNameFromPath(projectPath),
          sessionId,
          'subagents',
          `agent-${id}.meta.json`,
        )
        const [metaFile, stats] = await Promise.all([
          fs.readFile(metaPath, 'utf8'),
          fs.stat(metaPath),
        ])
        const meta = parseSubagentMeta(metaFile)
        return {
          id,
          ...meta,
          createdAt: stats.birthtime.toISOString(),
        }
      } catch {
        return null
      }
    }),
  )
  return subagents.filter((subagent) => subagent !== null)
}

export async function loadSubagentMessages({
  sessionId,
  projectId,
  agentId,
}: {
  sessionId: string
  projectId: string
  agentId: string
}): Promise<ClaudeJsonLine[]> {
  assertPathSegment(projectId, 'project id')
  assertPathSegment(sessionId, 'session id')
  assertPathSegment(agentId, 'subagent id')
  const projectPath = await projectPathForId(projectId)
  const messages = await getSubagentMessages(sessionId, agentId, { dir: projectPath })
  return Promise.all(
    messages.map((message) => enrichTaskNotification(sessionMessageToClaudeJsonLine(message))),
  )
}

function workflowRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function workflowString(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

function workflowNumber(source: Record<string, unknown>, key: string) {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function workflowStatus(value: unknown): ClaudeWorkflowStatus {
  if (value === 'completed') return 'completed'
  if (value === 'failed' || value === 'error') return 'failed'
  if (value === 'stopped' || value === 'cancelled' || value === 'aborted' || value === 'killed') {
    return 'stopped'
  }
  if (value === 'running' || value === 'in_progress') return 'running'
  if (value === 'starting' || value === 'pending' || value === 'queued') return 'starting'
  return 'unknown'
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function parseWorkflowPhases(value: unknown, progress: unknown): ClaudeWorkflowPhase[] {
  const progressPhases = Array.isArray(progress)
    ? progress.flatMap((entry) => {
        const source = workflowRecord(entry)
        const index = source ? workflowNumber(source, 'index') : undefined
        const title = source ? workflowString(source, 'title') : undefined
        return source?.type === 'workflow_phase' && index !== undefined && title
          ? [{ index, title }]
          : []
      })
    : []
  if (!Array.isArray(value)) return progressPhases
  const phases = value.flatMap((entry, arrayIndex) => {
    const source = workflowRecord(entry)
    if (!source) return []
    const title = workflowString(source, 'title')
    if (!title) return []
    const progressPhase =
      progressPhases.find((phase) => phase.title === title) ?? progressPhases[arrayIndex]
    return [
      withoutUndefined({
        index: workflowNumber(source, 'index') ?? progressPhase?.index ?? arrayIndex,
        title,
        detail: workflowString(source, 'detail'),
      }),
    ]
  })
  const indexes = new Set(phases.map((phase) => phase.index))
  return [...phases, ...progressPhases.filter((phase) => !indexes.has(phase.index))]
}

function parseWorkflowAgents(value: unknown): ClaudeWorkflowAgent[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry, arrayIndex) => {
    const source = workflowRecord(entry)
    if (!source || source.type !== 'workflow_agent') return []
    const label = workflowString(source, 'label')
    if (!label) return []
    return [
      withoutUndefined({
        index: workflowNumber(source, 'index') ?? arrayIndex,
        label,
        phaseIndex: workflowNumber(source, 'phaseIndex') ?? 0,
        phaseTitle: workflowString(source, 'phaseTitle'),
        agentId: workflowString(source, 'agentId'),
        model: workflowString(source, 'model'),
        fallbackModel: workflowString(source, 'fallbackModel'),
        state: workflowString(source, 'state') ?? 'queued',
        startedAt: workflowNumber(source, 'startedAt'),
        queuedAt: workflowNumber(source, 'queuedAt'),
        attempt: workflowNumber(source, 'attempt'),
        lastToolName: workflowString(source, 'lastToolName'),
        lastToolSummary: workflowString(source, 'lastToolSummary'),
        promptPreview: workflowString(source, 'promptPreview'),
        lastProgressAt: workflowNumber(source, 'lastProgressAt'),
        tokens: workflowNumber(source, 'tokens'),
        toolCalls: workflowNumber(source, 'toolCalls'),
        durationMs: workflowNumber(source, 'durationMs'),
        resultPreview: workflowString(source, 'resultPreview'),
      }),
    ]
  })
}

function parseWorkflowRun(value: string, expectedRunId: string): ClaudeWorkflowRun | null {
  const source = workflowRecord(JSON.parse(value))
  if (!source || workflowString(source, 'runId') !== expectedRunId) return null
  const logs = Array.isArray(source.logs)
    ? source.logs.filter((entry): entry is string => typeof entry === 'string')
    : undefined
  return withoutUndefined({
    runId: expectedRunId,
    taskId: workflowString(source, 'taskId'),
    workflowName: workflowString(source, 'workflowName'),
    summary: workflowString(source, 'summary'),
    status: workflowStatus(source.status),
    startTime: workflowNumber(source, 'startTime'),
    durationMs: workflowNumber(source, 'durationMs'),
    agentCount: workflowNumber(source, 'agentCount'),
    totalTokens: workflowNumber(source, 'totalTokens'),
    totalToolCalls: workflowNumber(source, 'totalToolCalls'),
    script: workflowString(source, 'script'),
    logs,
    result: source.result,
    phases: parseWorkflowPhases(source.phases, source.workflowProgress),
    agents: parseWorkflowAgents(source.workflowProgress),
  }) as ClaudeWorkflowRun
}

function parseJsonLines(value: string): Record<string, unknown>[] {
  return value.split('\n').flatMap((line) => {
    try {
      const parsed = workflowRecord(JSON.parse(line))
      return parsed ? [parsed] : []
    } catch {
      return []
    }
  })
}

function transcriptText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (!Array.isArray(value)) return undefined
  const text = value
    .flatMap((part) => {
      const source = workflowRecord(part)
      return source?.type === 'text' && typeof source.text === 'string' ? [source.text] : []
    })
    .join('\n')
    .trim()
  return text || undefined
}

function toolSummary(input: unknown): string | undefined {
  const source = workflowRecord(input)
  if (!source) return undefined
  for (const key of ['description', 'command', 'file_path', 'path']) {
    const value = workflowString(source, key)
    if (value) return value
  }
  return undefined
}

function parseLiveWorkflowAgent({
  agentId,
  index,
  journalResult,
  transcript,
}: {
  agentId: string
  index: number
  journalResult?: unknown
  transcript?: string
}): ClaudeWorkflowAgent {
  const entries = transcript ? parseJsonLines(transcript) : []
  let promptPreview: string | undefined
  let startedAt: number | undefined
  let lastProgressAt: number | undefined
  let lastToolName: string | undefined
  let lastToolSummary: string | undefined

  for (const entry of entries) {
    const timestamp = workflowString(entry, 'timestamp')
    const milliseconds = timestamp ? Date.parse(timestamp) : Number.NaN
    if (Number.isFinite(milliseconds)) {
      startedAt = startedAt === undefined ? milliseconds : Math.min(startedAt, milliseconds)
      lastProgressAt =
        lastProgressAt === undefined ? milliseconds : Math.max(lastProgressAt, milliseconds)
    }

    const message = workflowRecord(entry.message)
    if (!message) continue
    if (!promptPreview && entry.type === 'user') {
      promptPreview = transcriptText(message.content)
    }
    if (!Array.isArray(message.content)) continue
    for (const part of message.content) {
      const source = workflowRecord(part)
      if (!source || source.type !== 'tool_use') continue
      lastToolName = workflowString(source, 'name')
      lastToolSummary = toolSummary(source.input)
    }
  }

  return withoutUndefined({
    index,
    label: `Subagent ${index + 1}`,
    phaseIndex: 0,
    agentId,
    state: journalResult === undefined ? 'running' : 'done',
    startedAt,
    lastProgressAt,
    lastToolName,
    lastToolSummary,
    promptPreview,
    resultPreview: journalResult === undefined ? undefined : JSON.stringify(journalResult),
  }) as unknown as ClaudeWorkflowAgent
}

async function loadLiveWorkflowRun(
  sessionPath: string,
  runId: string,
): Promise<ClaudeWorkflowRun | null> {
  const transcriptPath = path.join(sessionPath, 'subagents', 'workflows', runId)
  let journal: string
  try {
    journal = await fs.readFile(path.join(transcriptPath, 'journal.jsonl'), 'utf8')
  } catch {
    return null
  }

  const agents = new Map<string, { result?: unknown }>()
  for (const entry of parseJsonLines(journal)) {
    const agentId = workflowString(entry, 'agentId')
    if (!agentId) continue
    if (entry.type === 'started' && !agents.has(agentId)) agents.set(agentId, {})
    if (entry.type === 'result') {
      const agent = agents.get(agentId) ?? {}
      agent.result = entry.result
      agents.set(agentId, agent)
    }
  }
  if (!agents.size) return null

  const parsedAgents = await Promise.all(
    Array.from(agents.entries()).map(async ([agentId, progress], index) => {
      let transcript: string | undefined
      try {
        transcript = await fs.readFile(path.join(transcriptPath, `agent-${agentId}.jsonl`), 'utf8')
      } catch {
        // The journal is enough to expose the agent while its transcript file is being created.
      }
      return parseLiveWorkflowAgent({
        agentId,
        index,
        journalResult: progress.result,
        transcript,
      })
    }),
  )
  const startTimes = parsedAgents.flatMap((agent) =>
    agent.startedAt === undefined ? [] : [agent.startedAt],
  )

  return withoutUndefined({
    runId,
    status: 'running',
    isPartial: true,
    startTime: startTimes.length ? Math.min(...startTimes) : undefined,
    agentCount: parsedAgents.length,
    phases: [],
    agents: parsedAgents,
  }) as ClaudeWorkflowRun
}

export async function loadWorkflowRuns({
  sessionId,
  projectId,
  runIds,
}: {
  sessionId: string
  projectId: string
  runIds: string[]
}): Promise<ClaudeWorkflowRun[]> {
  assertPathSegment(projectId, 'project id')
  assertPathSegment(sessionId, 'session id')
  runIds.forEach((runId) => assertPathSegment(runId, 'workflow run id'))
  const projectDirName = projectDirNameFromPath(await projectPathForId(projectId))

  const runs = await Promise.all(
    Array.from(new Set(runIds)).map(async (runId) => {
      const sessionPath = path.join(claudeDir(), 'projects', projectDirName, sessionId)
      const workflowPath = path.join(sessionPath, 'workflows', `${runId}.json`)
      try {
        const run = parseWorkflowRun(await fs.readFile(workflowPath, 'utf8'), runId)
        if (run) return run
      } catch {
        // The final record is only written when the workflow reaches a terminal state.
      }
      return loadLiveWorkflowRun(sessionPath, runId)
    }),
  )
  return runs.filter((run): run is ClaudeWorkflowRun => run !== null)
}

function assertPathSegment(value: string, label: string) {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\')) {
    throw new Error(`Invalid ${label}: ${value}`)
  }
}

export async function resolveSessionEditAnchor({
  sessionId,
  projectId,
  messageId,
}: {
  sessionId: string
  projectId: string
  messageId: string
}) {
  assertPathSegment(projectId, 'project id')
  assertPathSegment(sessionId, 'session id')
  const projectDirName = projectDirNameFromPath(await projectPathForId(projectId))
  const transcriptPath = path.join(claudeDir(), 'projects', projectDirName, `${sessionId}.jsonl`)
  const transcript = await fs.readFile(transcriptPath, 'utf8')
  return resolveMessageEditAnchor(parseSessionEntries(transcript), messageId)
}

export async function forkSessionAtMessage({
  sessionId,
  projectId,
  messageId,
}: {
  sessionId: string
  projectId: string
  messageId: string
}) {
  const projectPath = await projectPathForId(projectId)
  return sdkForkSession(sessionId, {
    dir: projectPath,
    upToMessageId: messageId,
  })
}
