import os from 'node:os'

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import type {
  Options,
  Query,
  RewindFilesResult,
  SDKMessage,
  SDKResultError,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'

import type {
  ClaudeContextUsageSnapshot,
  ClaudeInitializationResult,
  ClaudeJsonLine,
  ClaudeOptions,
  ClaudeQueryControlParams,
  ClaudeQueryStartParams,
  ClaudeQueryStreamInputCompleteParams,
  ClaudeQueryStreamInputErrorParams,
  ClaudeQueryStreamInputMessageParams,
  ClaudeQueryStreamInputStartParams,
  ClaudeSampleContextUsageParams,
  ClaudeStartupParams,
  ClaudeStreamId,
  ClaudeToolRequest,
  ClaudeToolResult,
} from '@/shared/rpc'

import { getLogger } from '../logging/runtime'
import { prepareAttachments } from './attachments'
import { sampleContextUsage } from './context-usage'
import type { ModelProxy } from './model-proxy'
import { createQueryProcess } from './query-process'
import { resolveClaudeCodeBinary } from './sdk-binary'
import { enrichTaskNotification } from './task-notification'

const logger = getLogger('query')

// Tag SDK-created sessions as `clotho` instead of the default `sdk-ts`. A
// session whose entrypoint is not in {sdk-cli, sdk-ts, sdk-py} is not treated
// as programmatic, so it stays visible in Clotho's list and `claude --resume`.
// `??=` keeps any caller-provided value intact.
process.env.CLAUDE_CODE_ENTRYPOINT ??= 'clotho'

// Keep TodoWrite/TaskCreate & friends available: newer models drop them from the
// default tool surface, which would silently starve the task-progress UI.
process.env.CLAUDE_CODE_ENABLE_TODO_TOOLS ??= '1'

export type ClaudeEventSink = {
  onOutput: (streamId: ClaudeStreamId, message: SDKMessage) => void
  onError: (streamId: ClaudeStreamId, message: string, stack?: string) => void
  onComplete: (streamId: ClaudeStreamId, success: boolean) => void
  onToolRequest: (streamId: ClaudeStreamId, request: ClaudeToolRequest) => void
}

// Pending tool decisions suspend canUseTool until the host (frontend) responds.
// A toolUseID is unique only within a Query, so address it together with streamId.
const pendingToolRequests = new Map<string, (result: ClaudeToolResult) => void>()
type ActiveQueryEntry = {
  sdk?: Query
  // Force-stop handle before init: interrupt() can be lost before the child process is ready, so abort is the fallback.
  abortController: AbortController
  // Whether system/init has arrived (the child process is ready and interrupt is reliable).
  initialized: boolean
  isCancelled: boolean
  startedAt: number
  terminalLogged: boolean
  finished: Promise<void>
  resolveFinished: () => void
  process: ReturnType<typeof createQueryProcess>
}
const activeQueries = new Map<ClaudeStreamId, ActiveQueryEntry>()
const activeInputStreams = new Map<string, AsyncInputQueue<SDKUserMessage>>()
type SdkUserMessageUuid = NonNullable<SDKUserMessage['uuid']>

class AsyncInputQueue<T> implements AsyncIterable<T> {
  private items: Array<
    { kind: 'value'; value: T } | { kind: 'done' } | { kind: 'error'; error: Error }
  > = []
  private pending: Array<{
    resolve: (result: IteratorResult<T>) => void
    reject: (error: Error) => void
  }> = []
  private closed = false

  push(value: T) {
    if (this.closed) return
    this.deliver({ kind: 'value', value })
  }

  finish() {
    if (this.closed) return
    this.closed = true
    this.deliver({ kind: 'done' })
  }

  fail(error: Error) {
    if (this.closed) return
    this.closed = true
    this.deliver({ kind: 'error', error })
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.next(),
    }
  }

  private next(): Promise<IteratorResult<T>> {
    const item = this.items.shift()
    if (item) {
      return this.itemToResult(item)
    }

    if (this.closed) {
      return Promise.resolve({ done: true, value: undefined })
    }

    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject })
    })
  }

  private deliver(
    item: { kind: 'value'; value: T } | { kind: 'done' } | { kind: 'error'; error: Error },
  ) {
    const pending = this.pending.shift()
    if (!pending) {
      this.items.push(item)
      return
    }

    void this.itemToResult(item).then(pending.resolve, pending.reject)
  }

  private itemToResult(
    item: { kind: 'value'; value: T } | { kind: 'done' } | { kind: 'error'; error: Error },
  ): Promise<IteratorResult<T>> {
    if (item.kind === 'value') {
      return Promise.resolve({ done: false, value: item.value })
    }
    if (item.kind === 'error') {
      return Promise.reject(item.error)
    }
    return Promise.resolve({ done: true, value: undefined })
  }
}

function inputStreamKey(streamId: ClaudeStreamId, inputStreamId: string) {
  return `${streamId}:${inputStreamId}`
}

function toolRequestKey(streamId: ClaudeStreamId, toolUseId: string) {
  return `${streamId}:${toolUseId}`
}

function isSdkResultError(message: SDKMessage): message is SDKResultError {
  return message.type === 'result' && message.subtype !== 'success'
}

function sdkResultErrorMessage(result: SDKResultError) {
  const errors = result.errors.map((error) => error.trim()).filter(Boolean)
  if (errors.length) return errors.join('\n')
  if (result.terminal_reason) return result.terminal_reason.replaceAll('_', ' ')
  return 'Claude returned an unsuccessful result'
}

/** Respond to a pending tool request from the host (frontend) as an SDK PermissionResult. */
export function respondToolRequest(
  streamId: ClaudeStreamId,
  toolUseId: string,
  result: ClaudeToolResult,
): void {
  const key = toolRequestKey(streamId, toolUseId)
  const resolve = pendingToolRequests.get(key)
  if (resolve) {
    pendingToolRequests.delete(key)
    resolve(result)
  }
}

/**
 * canUseTool callback: forward the routed tool decision to the host and suspend until it responds.
 * AskUserQuestion → kind='ask' (replace the bottom input form); other tools → kind='permission' (authorization button).
 * The mode (bypassPermissions/default, etc.) determines which decisions reach canUseTool;
 * this layer only routes by toolName and does not judge risk levels.
 */
function requestToolPermission(
  events: ClaudeEventSink,
  streamId: ClaudeStreamId,
  toolName: string,
  input: Record<string, unknown>,
  opts: {
    signal: AbortSignal
    toolUseID: string
    title?: string
    displayName?: string
    description?: string
  },
): Promise<ClaudeToolResult> {
  const kind: ClaudeToolRequest['kind'] = toolName === 'AskUserQuestion' ? 'ask' : 'permission'
  const request: ClaudeToolRequest = {
    kind,
    toolUseId: opts.toolUseID,
    input,
    ...(kind === 'permission' ? { toolName } : {}),
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.displayName ? { displayName: opts.displayName } : {}),
    ...(opts.description ? { description: opts.description } : {}),
  }
  return new Promise<ClaudeToolResult>((resolve) => {
    const key = toolRequestKey(streamId, opts.toolUseID)
    if (opts.signal.aborted) {
      resolve({ behavior: 'deny', message: 'Interrupted' })
      return
    }
    pendingToolRequests.set(key, (result) => {
      resolve(
        result.behavior === 'allow' && result.updatedInput === undefined
          ? { ...result, updatedInput: input }
          : result,
      )
    })
    opts.signal.addEventListener(
      'abort',
      () => {
        if (pendingToolRequests.has(key)) {
          pendingToolRequests.delete(key)
          resolve({ behavior: 'deny', message: 'Interrupted' })
        }
      },
      { once: true },
    )
    events.onToolRequest(streamId, request)
  })
}

async function streamQuery(
  events: ClaudeEventSink,
  streamId: ClaudeStreamId,
  entry: ActiveQueryEntry,
  sdk: Query,
  onFirstMessage?: () => void,
) {
  let initialized = false
  const markInitialized = () => {
    if (!initialized) {
      initialized = true
      onFirstMessage?.()
    }
  }
  try {
    for await (const message of sdk) {
      // User messages are written to session JSONL only after init; use system/init as the ready signal.
      if (!initialized && message.type === 'system' && message.subtype === 'init') {
        entry.initialized = true
        markInitialized()
      }
      const output = (await enrichTaskNotification(
        message as unknown as ClaudeJsonLine,
      )) as unknown as SDKMessage
      events.onOutput(streamId, output)
      if (isSdkResultError(message)) {
        throw new Error(sdkResultErrorMessage(message))
      }
    }

    logQueryTerminal(entry, entry.isCancelled ? 'cancelled' : 'completed')
    events.onComplete(streamId, true)
  } catch (caught) {
    markInitialized()
    const error = caught instanceof Error ? caught : undefined
    const stderr = entry.process.stderr().trim()
    const message = error?.message ?? 'Failed to execute Claude'
    events.onError(streamId, stderr ? `${message}. stderr: ${stderr}` : message, error?.stack)
    events.onComplete(streamId, false)
    logQueryTerminal(entry, entry.isCancelled ? 'cancelled' : 'failed', caught)
  } finally {
    markInitialized()
    try {
      // The SDK's message iterator ends before its subprocess necessarily
      // exits. Async disposal waits for the SDK transport cleanup, including
      // the child's shutdown writes to the session transcript.
      await sdk[Symbol.asyncDispose]?.()
      await entry.process.waitForExit()
    } catch (caught) {
      logger.error('query.close_failed', 'Failed to finish Claude query cleanup', { error: caught })
    } finally {
      if (activeQueries.get(streamId) === entry) activeQueries.delete(streamId)
      entry.resolveFinished()
    }
  }
}

function logQueryTerminal(
  entry: ActiveQueryEntry,
  outcome: 'cancelled' | 'completed' | 'failed',
  caught?: unknown,
) {
  if (entry.terminalLogged) return
  entry.terminalLogged = true
  const context = {
    durationMs: Date.now() - entry.startedAt,
    ...(/Session ID/i.test(entry.process.stderr()) ? { failureKind: 'session-id-conflict' } : {}),
  }
  if (outcome === 'cancelled') {
    logger.info('query.cancelled', 'A Claude query was cancelled', context)
  } else if (outcome === 'completed') {
    logger.info('query.completed', 'A Claude query completed', context)
  } else {
    const error = caught instanceof Error ? caught : new Error('Claude query execution failed')
    logger.error('query.failed', 'A Claude query failed', { context, error })
  }
}

type SdkInitializationResult = Omit<ClaudeInitializationResult, 'cwd' | 'resume'>

export type ClaudeProxyConnection = Pick<ModelProxy, 'sessionThinking' | 'settingsEnv'>

function normalizeOptions(
  options: ClaudeOptions | undefined,
  proxy?: ClaudeProxyConnection,
): Options {
  const qualifiedModel = options?.model
  const isClaudeModel = qualifiedModel?.startsWith('claude/') ?? false
  const isCustomModel = Boolean(qualifiedModel?.includes('/') && !isClaudeModel)
  const normalized: Options = {
    ...options,
    cwd: options?.cwd ?? os.homedir(),
    enableFileCheckpointing: true,
  }
  // When packaged, the SDK's own resolution would point inside the asar
  // archive, where the CLI binary cannot be spawned from.
  const claudeCodeBinary = resolveClaudeCodeBinary()
  if (claudeCodeBinary) normalized.pathToClaudeCodeExecutable = claudeCodeBinary
  if (isClaudeModel) normalized.model = qualifiedModel?.slice('claude/'.length)
  if (isCustomModel && proxy) {
    normalized.settings = { env: proxy.settingsEnv(qualifiedModel) }
    // Forward mapping: run the session at the claude effort derived from the
    // model's configured thinking level. Re-injected on every query on
    // purpose — the model configuration is the single source of truth for
    // thinking, so an in-session `/effort` pick is intentionally overridden.
    const thinking = proxy.sessionThinking(qualifiedModel)
    if (thinking?.disabled) normalized.thinking = { type: 'disabled' }
    else if (thinking?.enabled) normalized.thinking = { type: 'enabled' }
    else if (thinking?.effort) normalized.effort = thinking.effort
  }
  return normalized
}

function pendingPrompt(): AsyncIterable<never> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => new Promise<IteratorResult<never>>(() => {}),
      }
    },
  }
}

export async function startup({
  options,
  initializeTimeoutMs = 60_000,
}: ClaudeStartupParams = {}): Promise<ClaudeInitializationResult> {
  const normalizedOptions = normalizeOptions(options)
  const sdk = sdkQuery({
    prompt: pendingPrompt(),
    options: normalizedOptions,
  })
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    const result = (await Promise.race([
      sdk.initializationResult(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Claude initialization timed out after ${initializeTimeoutMs}ms`))
        }, initializeTimeoutMs)
      }),
    ])) as SdkInitializationResult

    return {
      cwd: normalizedOptions.cwd ?? os.homedir(),
      resume: normalizedOptions.resume,
      commands: result.commands ?? [],
      agents: result.agents ?? [],
      models: result.models ?? [],
      account: result.account,
      output_style: result.output_style,
      available_output_styles: result.available_output_styles,
      fast_mode_state: result.fast_mode_state,
    }
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
    sdk.close()
  }
}

export async function rewindSessionFiles({
  cwd,
  sessionId,
  userMessageId,
  dryRun,
  initializeTimeoutMs = 60_000,
}: {
  cwd: string
  sessionId: string
  userMessageId: string
  dryRun?: boolean
  initializeTimeoutMs?: number
}): Promise<RewindFilesResult> {
  const sdk = sdkQuery({
    prompt: pendingPrompt(),
    options: normalizeOptions({ cwd, resume: sessionId }),
  })
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      sdk.initializationResult(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Claude rewind initialization timed out after ${initializeTimeoutMs}ms`))
        }, initializeTimeoutMs)
      }),
    ])
    return await sdk.rewindFiles(userMessageId, { dryRun })
  } finally {
    if (timeout) clearTimeout(timeout)
    sdk.close()
  }
}

/**
 * Sample the context-window usage of a session that has no live query — the
 * status entry between turns. Boots an idle resumed query, waits for the child
 * process to be ready, takes one sample, and closes the query.
 */
export async function sampleSessionContextUsage(
  { cwd, sessionId, model, initializeTimeoutMs = 60_000 }: ClaudeSampleContextUsageParams,
  proxy?: ClaudeProxyConnection,
): Promise<ClaudeContextUsageSnapshot | null> {
  const sdk = sdkQuery({
    prompt: pendingPrompt(),
    options: normalizeOptions({ cwd, resume: sessionId, model }, proxy),
  })
  let timeout: ReturnType<typeof setTimeout> | undefined

  try {
    await Promise.race([
      sdk.initializationResult(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Claude usage sampling timed out after ${initializeTimeoutMs}ms`))
        }, initializeTimeoutMs)
      }),
    ])
    return await sampleContextUsage(sdk)
  } finally {
    if (timeout) clearTimeout(timeout)
    sdk.close()
  }
}

export function startQuery(
  events: ClaudeEventSink,
  {
    streamId,
    prompt,
    attachments,
    options,
    userMessageUuid,
    syntheticOrigin,
  }: ClaudeQueryStartParams,
  proxy: ClaudeProxyConnection,
): { initialized: Promise<void> } {
  if (!prompt.trim() && !attachments?.length) {
    throw new Error('Prompt cannot be empty')
  }

  const startedAt = Date.now()
  logger.info('query.started', 'A Claude query started')
  const abortController = new AbortController()
  const entry: ActiveQueryEntry = {
    abortController,
    initialized: false,
    isCancelled: false,
    startedAt,
    terminalLogged: false,
    finished: Promise.resolve(),
    resolveFinished: () => {},
    process: createQueryProcess(),
  }
  entry.finished = new Promise<void>((resolve) => {
    entry.resolveFinished = resolve
  })
  activeQueries.set(streamId, entry)
  let resolveInitialized!: () => void
  const initialized = new Promise<void>((resolve) => {
    resolveInitialized = resolve
  })
  const launch = (input: string | AsyncIterable<SDKUserMessage>) => {
    entry.sdk = sdkQuery({
      prompt: input,
      options: {
        ...normalizeOptions(options, proxy),
        forwardSubagentText: true,
        includePartialMessages: true,
        abortController,
        spawnClaudeCodeProcess: entry.process.spawn,
        // bypassPermissions auto-approves before the callback runs; omitting it
        // keeps behavior identical and avoids the SDK shadow warning.
        ...(options?.permissionMode === 'bypassPermissions'
          ? {}
          : {
              canUseTool: async (toolName, input, toolOpts) =>
                requestToolPermission(events, streamId, toolName, input, toolOpts),
            }),
      },
    })
    void streamQuery(events, streamId, entry, entry.sdk, resolveInitialized)
  }

  if (attachments?.length) {
    void (async () => {
      try {
        const content = await prepareAttachments(attachments, abortController.signal)
        abortController.signal.throwIfAborted()
        async function* input(): AsyncIterable<SDKUserMessage> {
          yield {
            type: 'user',
            ...(userMessageUuid ? { uuid: userMessageUuid as SdkUserMessageUuid } : {}),
            parent_tool_use_id: null,
            origin: { kind: 'human' },
            message: {
              role: 'user',
              content: [
                ...(prompt.trim() ? [{ type: 'text' as const, text: prompt }] : []),
                ...content,
              ],
            },
          }
        }
        launch(input())
      } catch (caught) {
        if (activeQueries.get(streamId) === entry) activeQueries.delete(streamId)
        const error = caught instanceof Error ? caught : undefined
        events.onError(streamId, error?.message ?? 'Failed to prepare attachments', error?.stack)
        events.onComplete(streamId, false)
        logQueryTerminal(entry, entry.isCancelled ? 'cancelled' : 'failed', caught)
        resolveInitialized()
        entry.resolveFinished()
      }
    })()
  } else {
    try {
      if (!userMessageUuid) {
        // Keep the legacy string path for callers that do not provide a client
        // UUID (for example startup helpers and older RPC clients).
        launch(prompt)
      } else {
        // The CLI rewrites synthetic messages as non-user-source frames and
        // persists them with isMeta, so they stay out of rendered history.
        const origin = syntheticOrigin
          ? ({ kind: syntheticOrigin } as SDKUserMessage['origin'])
          : ({ kind: 'human' } as const)
        async function* input(): AsyncIterable<SDKUserMessage> {
          yield {
            type: 'user',
            uuid: userMessageUuid as SdkUserMessageUuid,
            parent_tool_use_id: null,
            ...(syntheticOrigin ? { isSynthetic: true } : {}),
            origin,
            message: {
              role: 'user',
              content: [{ type: 'text', text: prompt }],
            },
          }
        }
        launch(input())
      }
    } catch (caught) {
      activeQueries.delete(streamId)
      logQueryTerminal(entry, 'failed', caught)
      entry.resolveFinished()
      throw caught
    }
  }
  return { initialized }
}

export async function controlQuery({ streamId, command, params = [] }: ClaudeQueryControlParams) {
  const entry = activeQueries.get(streamId)
  if (!entry) {
    throw new Error(`Claude query stream not found: ${streamId}`)
  }
  const sdk = entry.sdk

  if (command === 'interrupt') {
    // interrupt() is discarded before child-process init; use abort as the immediate fallback.
    entry.isCancelled = true
    if (entry.initialized && sdk) return sdk.interrupt()
    entry.abortController.abort()
    return
  }
  if (!sdk) throw new Error(`Claude query is preparing attachments: ${streamId}`)

  switch (command) {
    case 'rewindFiles':
      return sdk.rewindFiles(params[0] as string, params[1] as { dryRun?: boolean } | undefined)
    case 'setPermissionMode':
      return sdk.setPermissionMode(params[0] as never)
    case 'setModel':
      return sdk.setModel(params[0] as string | undefined)
    case 'setMaxThinkingTokens':
      return sdk.setMaxThinkingTokens(params[0] as number | null)
    case 'applyFlagSettings':
      return sdk.applyFlagSettings(params[0] as never)
    case 'initializationResult':
      return sdk.initializationResult()
    case 'reinitialize':
      return sdk.reinitialize()
    case 'supportedCommands':
      return sdk.supportedCommands()
    case 'supportedModels':
      return sdk.supportedModels()
    case 'supportedAgents':
      return sdk.supportedAgents()
    case 'mcpServerStatus':
      return sdk.mcpServerStatus()
    case 'accountInfo':
      return sdk.accountInfo()
    case 'reconnectMcpServer':
      return sdk.reconnectMcpServer(params[0] as string)
    case 'toggleMcpServer':
      return sdk.toggleMcpServer(params[0] as string, params[1] as boolean)
    case 'setMcpServers':
      return sdk.setMcpServers(params[0] as never)
    case 'stopTask':
      return sdk.stopTask(params[0] as string)
    case 'getContextUsage':
      return sampleContextUsage(sdk)
  }
}

export async function startQueryInputStream({
  streamId,
  inputStreamId,
}: ClaudeQueryStreamInputStartParams) {
  const sdk = activeQueries.get(streamId)?.sdk
  if (!sdk) {
    throw new Error(`Claude query stream not found: ${streamId}`)
  }

  const key = inputStreamKey(streamId, inputStreamId)
  const queue = new AsyncInputQueue<SDKUserMessage>()
  activeInputStreams.set(key, queue)
  void sdk.streamInput(queue).finally(() => {
    activeInputStreams.delete(key)
  })
}

export function pushQueryInputMessage({
  streamId,
  inputStreamId,
  message,
}: ClaudeQueryStreamInputMessageParams): void {
  const queue = activeInputStreams.get(inputStreamKey(streamId, inputStreamId))
  if (!queue) {
    throw new Error(`Claude query input stream not found: ${inputStreamId}`)
  }

  queue.push(message)
}

export function completeQueryInputStream({
  streamId,
  inputStreamId,
}: ClaudeQueryStreamInputCompleteParams): void {
  const queue = activeInputStreams.get(inputStreamKey(streamId, inputStreamId))
  if (!queue) return
  queue.finish()
}

export function failQueryInputStream({
  streamId,
  inputStreamId,
  message,
}: ClaudeQueryStreamInputErrorParams): void {
  const queue = activeInputStreams.get(inputStreamKey(streamId, inputStreamId))
  if (!queue) return
  queue.fail(new Error(message))
}

export async function closeQuery(streamId: ClaudeStreamId): Promise<void> {
  const entry = activeQueries.get(streamId)
  if (!entry) return
  entry.isCancelled = true
  logQueryTerminal(entry, 'cancelled')
  activeQueries.delete(streamId)
  for (const [key, queue] of activeInputStreams) {
    if (key.startsWith(`${streamId}:`)) {
      queue.finish()
      activeInputStreams.delete(key)
    }
  }
  entry.abortController.abort()
  entry.sdk?.close()
  // close() starts cleanup but discards its promise. Async disposal joins that
  // same cleanup promise; receiving EOF from the message stream alone is not
  // sufficient to safely delete or reuse the transcript.
  await entry.sdk?.[Symbol.asyncDispose]?.()
  await entry.process.waitForExit()
  await entry.finished
  logger.info('query.closed', 'The Claude query transport finished closing')
}
