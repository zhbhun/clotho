import { randomUUID } from 'node:crypto'

import type { SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'

import type {
  ClaudeContextUsageSnapshot,
  ClaudeOptions,
  ClaudePurgeDeadPairsResult,
  ClaudeSampleContextUsageParams,
  ClaudeSessionQueryAttachParams,
  ClaudeSessionQueryEnsureParams,
  ClaudeSessionQueryEnsureResult,
  ClaudeSessionQueryPushParams,
  ClaudeSessionQueryRebuildParams,
  ClaudeSessionQueryRecycleCheckParams,
  ClaudeSessionQueryRecycleCheckResult,
  ClaudeSessionQuerySetModelParams,
  ClaudeSessionQuerySetModelResult,
  ClaudeSessionRuntimeChanged,
  ClaudeStreamId,
  ClaudeToolRequest,
  ClaudeToolResult,
} from '@/shared/rpc'

import { getLogger } from '../logging/runtime'
import { prepareAttachments } from './attachments'
import type { ModelProxy } from './model-proxy'
import type { AgentCapabilityFilters } from './runner'
import {
  AsyncInputQueue,
  type ClaudeEventSink,
  closeQuery,
  controlQuery,
  pendingToolRequestIds,
  respondToolRequest,
  startQuery,
} from './runner'
import { dropTrailingTurn, purgeDeadPairs } from './transcript'

const logger = getLogger('query')

/** An idle query keeps its CLI process warm for this long before being recycled. */
const IDLE_RECYCLE_MS = 60_000

/** Upper bound on replayed frames so a runaway turn cannot grow without limit. */
const REPLAY_LIMIT = 500

interface SessionQueryEntry {
  sessionId: string
  streamId: ClaudeStreamId
  queue: AsyncInputQueue<SDKUserMessage>
  /** Owns in-flight attachment preparation; aborted on teardown. */
  abort: AbortController
  idleTimer: ReturnType<typeof setTimeout> | null
  /** The qualified model the query was created with (or last switched to). */
  model: string | undefined
  /** The agent the query was created with, when one was picked. */
  agent: string | undefined
  state: {
    claudeSessionId: string | null
    status: 'starting' | 'ready' | 'dead'
    turnInFlight: boolean
    toolRequests: Map<string, ClaudeToolRequest>
    backgroundTaskIds: Set<string>
  }
  /** Frames since the last result, replayed to a renderer that re-attaches mid-turn. */
  replay: SDKMessage[]
}

export interface SessionQueryRegistry {
  ensure(params: ClaudeSessionQueryEnsureParams): Promise<ClaudeSessionQueryEnsureResult>
  /** The live query's snapshot, or null when none is running — never spawns one. */
  attach(params: ClaudeSessionQueryAttachParams): ClaudeSessionQueryEnsureResult | null
  push(params: ClaudeSessionQueryPushParams): Promise<void>
  rebuild(params: ClaudeSessionQueryRebuildParams): Promise<ClaudeSessionQueryEnsureResult>
  recycleCheck(params: ClaudeSessionQueryRecycleCheckParams): ClaudeSessionQueryRecycleCheckResult
  /** Answers a tool request through the query and reports the runtime change. */
  respondTool(params: {
    streamId: ClaudeStreamId
    toolUseId: string
    result: ClaudeToolResult
  }): boolean
  /**
   * Switch the live query to another model of the same class; cross-class
   * switches (claude ↔ proxy) report back so the caller rebuilds instead.
   */
  setModel(params: ClaudeSessionQuerySetModelParams): Promise<ClaudeSessionQuerySetModelResult>
  /** Force-close the session's query regardless of liveness (session deletion). */
  close(sessionId: string): Promise<void>
  /** A renderer window started showing the session; its close no longer recycles idle queries. */
  viewOpened(sessionId: string, windowId: string): void
  /** A renderer window stopped showing the session. */
  viewClosed(sessionId: string, windowId: string): void
  /** Forgets every session view a (closed) window held. */
  dropWindow(windowId: string): void
  sampleContextUsage(
    params: ClaudeSampleContextUsageParams,
  ): Promise<ClaudeContextUsageSnapshot | null>
  /** True when a live query owns this Claude session — callers must not spawn another CLI for it. */
  hasLiveQuery(claudeSessionId: string): boolean
  closeAll(): Promise<void>
}

/** Claude-hosted models carry no proxy env; every other qualified model does. */
function isClaudeQualifiedModel(model: string | undefined): boolean {
  return model?.startsWith('claude/') ?? false
}

/**
 * Whether a session query may be closed right now. Anything the SDK would keep
 * working on after the renderer walks away — a running turn, a permission the
 * host still owes an answer to, or a non-ambient background task — blocks it.
 */
export function sessionRecycleGate(state: {
  turnInFlight: boolean
  pendingToolRequestIds: string[]
  backgroundTaskIds: string[]
}): { canRecycle: boolean; busy: string[] } {
  const busy: string[] = []
  if (state.turnInFlight) busy.push('turn-in-flight')
  if (state.pendingToolRequestIds.length) busy.push('pending-permissions')
  if (state.backgroundTaskIds.length) busy.push('background-tasks')
  return { canRecycle: busy.length === 0, busy }
}

function gateFor(entry: SessionQueryEntry) {
  return sessionRecycleGate({
    turnInFlight: entry.state.turnInFlight,
    pendingToolRequestIds: liveToolRequests(entry).map((request) => request.toolUseId),
    backgroundTaskIds: [...entry.state.backgroundTaskIds],
  })
}

function liveToolRequests(entry: SessionQueryEntry): ClaudeToolRequest[] {
  const pending = new Set(pendingToolRequestIds(entry.streamId))
  return [...entry.state.toolRequests.values()].filter((request) => pending.has(request.toolUseId))
}

function snapshot(entry: SessionQueryEntry): ClaudeSessionQueryEnsureResult {
  return {
    streamId: entry.streamId,
    state: {
      claudeSessionId: entry.state.claudeSessionId,
      status: entry.state.status,
      turnInFlight: entry.state.turnInFlight,
      pendingToolRequests: liveToolRequests(entry),
      backgroundTaskIds: [...entry.state.backgroundTaskIds],
      ...(entry.model ? { model: entry.model } : {}),
      ...(entry.agent ? { agent: entry.agent } : {}),
    },
    replay: [...entry.replay],
  }
}

/** The SDK emits `background_tasks_changed` as the full current task set. */
function backgroundTaskIdsOf(message: SDKMessage): string[] | null {
  if (message.type !== 'system' || message.subtype !== 'background_tasks_changed') return null
  const tasks = (message as { tasks?: Array<{ task_id?: string; ambient?: boolean }> }).tasks ?? []
  return tasks.flatMap((task) => (task.task_id && !task.ambient ? [task.task_id] : []))
}

function applyFrame(entry: SessionQueryEntry, message: SDKMessage) {
  if (message.type === 'result') {
    entry.state.turnInFlight = false
    entry.replay = []
    return
  }
  if (message.type === 'user' || message.type === 'assistant' || message.type === 'stream_event') {
    entry.state.turnInFlight = true
  }
  const backgroundTaskIds = backgroundTaskIdsOf(message)
  if (backgroundTaskIds) entry.state.backgroundTaskIds = new Set(backgroundTaskIds)
  if (message.type === 'system' && message.subtype === 'init') {
    const claudeSessionId = (message as { session_id?: string }).session_id
    if (claudeSessionId) entry.state.claudeSessionId = claudeSessionId
    entry.state.status = 'ready'
  }
  if (entry.replay.length < REPLAY_LIMIT) entry.replay.push(message)
}

export function createSessionQueryRegistry(
  events: ClaudeEventSink,
  proxy: ModelProxy,
  hooks: {
    onRecycled?: (sessionId: string) => void
    /** Fired on every live-shape change: new query, turn flips, tool requests, teardown. */
    onRuntimeChanged?: (change: ClaudeSessionRuntimeChanged) => void
    /** Resolves Clotho-scoped skill/plugin filters applied at each spawn (design D7). */
    resolveAgentCapabilities?: () => Promise<AgentCapabilityFilters | undefined>
  } = {},
): SessionQueryRegistry {
  const entries = new Map<string, SessionQueryEntry>()
  const chains = new Map<string, Promise<unknown>>()
  /** Windows currently showing a session; keeps an idle query alive across tab closes. */
  const holders = new Map<string, Set<string>>()

  const emitRuntime = (entry: SessionQueryEntry) =>
    hooks.onRuntimeChanged?.({
      sessionId: entry.sessionId,
      streamId: entry.streamId,
      deadStreamId: null,
      turnInFlight: entry.state.turnInFlight,
      pendingToolRequestIds: liveToolRequests(entry).map((request) => request.toolUseId),
    })
  const emitGone = (entry: SessionQueryEntry) =>
    hooks.onRuntimeChanged?.({
      sessionId: entry.sessionId,
      streamId: null,
      deadStreamId: entry.streamId,
      turnInFlight: false,
      pendingToolRequestIds: [],
    })

  /** Serialize lifecycle operations per session so ensure/rebuild cannot interleave. */
  function chain<T>(sessionId: string, run: () => Promise<T>): Promise<T> {
    const next = (chains.get(sessionId) ?? Promise.resolve()).then(run, run)
    chains.set(
      sessionId,
      next.catch(() => {}),
    )
    return next
  }

  function entryByStreamId(streamId: ClaudeStreamId): SessionQueryEntry | undefined {
    for (const entry of entries.values()) {
      if (entry.streamId === streamId) return entry
    }
    return undefined
  }

  function clearIdleTimer(entry: SessionQueryEntry) {
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = null
    }
  }

  function armIdleTimer(entry: SessionQueryEntry) {
    clearIdleTimer(entry)
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null
      if (entries.get(entry.sessionId) !== entry) return
      if (!gateFor(entry).canRecycle) {
        armIdleTimer(entry)
        return
      }
      logger.info('session.idle_recycle', 'An idle session query is being recycled', {
        context: { sessionId: entry.sessionId },
      })
      void recycle(entry)
    }, IDLE_RECYCLE_MS)
    entry.idleTimer.unref?.()
  }

  async function teardown(entry: SessionQueryEntry, notifyRecycled: boolean) {
    if (entries.get(entry.sessionId) === entry) entries.delete(entry.sessionId)
    clearIdleTimer(entry)
    entry.state.status = 'dead'
    entry.abort.abort()
    // The SDK synchronously pulls the first next() inside query(); the queue
    // must hand it a parked promise until a push arrives, so only finish it
    // once the query itself is going away.
    entry.queue.finish()
    try {
      await closeQuery(entry.streamId)
    } catch (caught) {
      logger.error('session.close_failed', 'Failed to close a session query', { error: caught })
    }
    emitGone(entry)
    if (notifyRecycled) hooks.onRecycled?.(entry.sessionId)
  }

  async function recycle(entry: SessionQueryEntry) {
    await chain(entry.sessionId, async () => {
      if (entries.get(entry.sessionId) !== entry) return
      await teardown(entry, true)
    })
  }

  function decorateSink(entry: SessionQueryEntry): ClaudeEventSink {
    return {
      onOutput(streamId, message) {
        const wasInFlight = entry.state.turnInFlight
        applyFrame(entry, message)
        armIdleTimer(entry)
        if (entry.state.turnInFlight !== wasInFlight) emitRuntime(entry)
        events.onOutput(streamId, message)
      },
      onError(streamId, message, stack) {
        armIdleTimer(entry)
        events.onError(streamId, message, stack)
      },
      onComplete(streamId, success) {
        // Recycle and rebuild both tear down before closing, so a query that
        // ends on its own is the only path that reaches here still registered.
        if (entries.get(entry.sessionId) === entry) {
          entries.delete(entry.sessionId)
          clearIdleTimer(entry)
          entry.state.status = 'dead'
          entry.abort.abort()
          entry.queue.finish()
          // Same signal as an explicit recycle: a renderer holding a closed
          // tab's controller in the background releases it on this push.
          emitGone(entry)
          hooks.onRecycled?.(entry.sessionId)
        }
        events.onComplete(streamId, success)
      },
      onToolRequest(streamId, request) {
        entry.state.toolRequests.set(request.toolUseId, request)
        armIdleTimer(entry)
        emitRuntime(entry)
        events.onToolRequest(streamId, request)
      },
    }
  }

  async function ensureRaw({
    sessionId,
    claudeSessionId,
    options,
  }: ClaudeSessionQueryEnsureParams): Promise<ClaudeSessionQueryEnsureResult> {
    const existing = entries.get(sessionId)
    if (existing && existing.state.status !== 'dead') return snapshot(existing)
    if (existing) await teardown(existing, false)

    const streamId = `session-${randomUUID()}`
    const queue = new AsyncInputQueue<SDKUserMessage>()
    const entry: SessionQueryEntry = {
      sessionId,
      streamId,
      queue,
      abort: new AbortController(),
      idleTimer: null,
      model: options?.model,
      agent: options?.agent,
      state: {
        claudeSessionId: claudeSessionId ?? null,
        status: 'starting',
        turnInFlight: false,
        toolRequests: new Map(),
        backgroundTaskIds: new Set(),
      },
      replay: [],
    }
    entries.set(sessionId, entry)
    const queryOptions: ClaudeOptions = { ...options }
    if (claudeSessionId) {
      delete queryOptions.sessionId
      queryOptions.resume = claudeSessionId
    } else {
      delete queryOptions.resume
      delete queryOptions.resumeSessionAt
      // A fresh query keeps the caller's reserved Claude session id (a
      // first-turn recall can recreate the same id) or falls back to the clotho
      // session id so the CLI transcript lands under a stable key.
      queryOptions.sessionId = queryOptions.sessionId ?? sessionId
    }
    startQuery(decorateSink(entry), { streamId, options: queryOptions }, proxy, {
      tolerateResultErrors: true,
      promptQueue: queue,
      capabilities: await hooks.resolveAgentCapabilities?.(),
    })
    armIdleTimer(entry)
    emitRuntime(entry)
    return snapshot(entry)
  }

  async function pushRaw(params: ClaudeSessionQueryPushParams): Promise<void> {
    await chain(entryByStreamId(params.streamId)?.sessionId ?? params.streamId, () =>
      pushChained(params),
    )
  }

  /** Runs behind any pending ensure/rebuild/recycle, so a push cannot interleave a teardown. */
  async function pushChained({
    streamId,
    text,
    attachments,
    userMessageUuid,
    syntheticOrigin,
  }: ClaudeSessionQueryPushParams): Promise<void> {
    const entry = entryByStreamId(streamId)
    if (!entry || entry.state.status === 'dead') {
      throw new Error(`Claude session query not available: ${streamId}`)
    }
    armIdleTimer(entry)
    const content: SDKUserMessage['message']['content'] = []
    if (text.trim()) content.push({ type: 'text', text })
    if (attachments?.length)
      content.push(...(await prepareAttachments(attachments, entry.abort.signal)))
    // The CLI rewrites synthetic messages as non-user-source frames and
    // persists them with isMeta, so they stay out of rendered history.
    const userMessage: SDKUserMessage = {
      type: 'user',
      ...(userMessageUuid ? { uuid: userMessageUuid as SDKUserMessage['uuid'] } : {}),
      parent_tool_use_id: null,
      ...(syntheticOrigin ? { isSynthetic: true } : {}),
      origin: syntheticOrigin
        ? ({ kind: syntheticOrigin } as SDKUserMessage['origin'])
        : { kind: 'human' },
      message: { role: 'user', content },
    }
    entry.queue.push(userMessage)
    // The CLI never echoes the pushed prompt back as output, so the broadcast
    // is the only way windows watching this session (including the sender's
    // own stream) see the new user turn; uuid dedup absorbs the sender's
    // optimistic copy.
    events.onOutput(streamId, userMessage)
  }

  async function rebuildRaw({
    sessionId,
    claudeSessionId,
    options,
    reason,
    dropFromMessageUuid,
    projectId,
  }: ClaudeSessionQueryRebuildParams): Promise<ClaudeSessionQueryEnsureResult> {
    const entry = entries.get(sessionId)
    if (entry) {
      // Verified stop recipe: interrupt first so the turn ends, then deny any
      // still-pending canUseTool (a late deny is silently discarded by the CLI).
      try {
        await controlQuery({ streamId: entry.streamId, command: 'interrupt' })
      } catch {
        // Pre-init queries abort on interrupt; teardown below handles them.
      }
      for (const toolUseId of pendingToolRequestIds(entry.streamId)) {
        respondToolRequest(entry.streamId, toolUseId, { behavior: 'deny', message: 'Interrupted' })
      }
      await teardown(entry, false)
    }

    let resume = claudeSessionId ?? null
    if (resume && projectId && dropFromMessageUuid) {
      const dropped = await dropTrailingTurn({
        projectId,
        sessionId: resume,
        userMessageUuid: dropFromMessageUuid,
        // The edit restarts from the edited message, so later turns are
        // deliberately discarded; a recall would refuse them as newer
        // conversation another client may have added.
        allowLaterConversation: reason === 'edit',
      })
      if (!dropped.dropped) {
        throw new Error('Failed to clear the historical message before resending')
      }
      if (dropped.removedSession) resume = null
    }
    if (resume && projectId) {
      const purged: ClaudePurgeDeadPairsResult = await purgeDeadPairs({
        projectId,
        sessionId: resume,
      })
      if (purged.removedSession) resume = null
    }
    return ensureRaw({ sessionId, claudeSessionId: resume ?? undefined, options })
  }

  return {
    ensure: (params) => chain(params.sessionId, () => ensureRaw(params)),
    attach({ sessionId }) {
      const entry = entries.get(sessionId)
      return entry && entry.state.status !== 'dead' ? snapshot(entry) : null
    },
    push: pushRaw,
    rebuild: (params) => chain(params.sessionId, () => rebuildRaw(params)),
    recycleCheck({ sessionId, windowId }) {
      const entry = entries.get(sessionId)
      if (!entry) return { recycled: true, busy: [] }
      const gate = gateFor(entry)
      if (!gate.canRecycle) return { recycled: false, busy: gate.busy }
      // Another window still shows the session: its view keeps the warm query
      // so it does not watch a live turn die under it.
      const viewers = holders.get(sessionId)
      if (viewers && [...viewers].some((holder) => holder !== windowId)) {
        return { recycled: false, busy: ['open-elsewhere'] }
      }
      void recycle(entry)
      return { recycled: true, busy: [] }
    },
    respondTool({ streamId, toolUseId, result }) {
      const entry = entryByStreamId(streamId)
      respondToolRequest(streamId, toolUseId, result)
      if (!entry) return false
      emitRuntime(entry)
      return true
    },
    viewOpened(sessionId, windowId) {
      const viewers = holders.get(sessionId) ?? new Set<string>()
      viewers.add(windowId)
      holders.set(sessionId, viewers)
    },
    viewClosed(sessionId, windowId) {
      const viewers = holders.get(sessionId)
      if (!viewers) return
      viewers.delete(windowId)
      if (viewers.size === 0) holders.delete(sessionId)
    },
    dropWindow(windowId) {
      for (const [sessionId, viewers] of holders) {
        viewers.delete(windowId)
        if (viewers.size === 0) holders.delete(sessionId)
      }
    },
    async setModel({
      sessionId,
      model,
    }: ClaudeSessionQuerySetModelParams): Promise<ClaudeSessionQuerySetModelResult> {
      return chain(sessionId, async () => {
        const entry = entries.get(sessionId)
        if (!entry || entry.state.status === 'dead') return { applied: false, reason: 'missing' }
        // A claude ↔ proxy switch changes the process env (the proxy base URL),
        // which only a rebuild can apply; same-class switches keep the query.
        if (isClaudeQualifiedModel(entry.model) !== isClaudeQualifiedModel(model)) {
          return { applied: false, reason: 'model-class' }
        }
        const isClaude = isClaudeQualifiedModel(model)
        await controlQuery({
          streamId: entry.streamId,
          command: 'setModel',
          params: [isClaude ? model.slice('claude/'.length) : model],
        })
        // The query options baked the previous model's thinking mapping; replay
        // the new model's effort tier (claude models carry no mapping).
        if (!isClaude) {
          const effort = proxy.sessionThinking(model)?.effort
          if (effort) {
            await controlQuery({
              streamId: entry.streamId,
              command: 'applyFlagSettings',
              params: [{ effortLevel: effort }],
            }).catch((error: unknown) => {
              logger.warning('session.model_effort_failed', 'Failed to replay the effort level', {
                context: { sessionId, model },
                error,
              })
            })
          }
        }
        entry.model = model
        armIdleTimer(entry)
        return { applied: true }
      })
    },
    async sampleContextUsage(params) {
      for (const entry of entries.values()) {
        if (entry.state.claudeSessionId !== params.sessionId) continue
        if (entry.state.status === 'dead') continue
        try {
          return (await controlQuery({
            streamId: entry.streamId,
            command: 'getContextUsage',
          })) as ClaudeContextUsageSnapshot | null
        } catch {
          return null
        }
      }
      return null
    },
    close: (sessionId: string) =>
      chain(sessionId, async () => {
        const entry = entries.get(sessionId)
        if (entry) await teardown(entry, false)
      }),
    hasLiveQuery(claudeSessionId: string): boolean {
      for (const entry of entries.values()) {
        if (entry.state.claudeSessionId === claudeSessionId && entry.state.status !== 'dead') {
          return true
        }
      }
      return false
    },
    closeAll: async () => {
      await Promise.all([...entries.values()].map((entry) => teardown(entry, false)))
    },
  }
}
