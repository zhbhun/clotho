// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { query as sdkQuery } from '@anthropic-ai/claude-agent-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as queryProcessApi from './query-process'
import * as runnerApi from './runner'
import {
  type ClaudeEventSink,
  closeQuery,
  completeQueryInputStream,
  controlQuery,
  pushQueryInputMessage,
  respondToolRequest,
  startQuery,
  startQueryInputStream,
  startup,
} from './runner'

const sdkMocks = vi.hoisted(() => ({
  query: vi.fn(),
}))
const loggingMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => sdkMocks)
vi.mock('../logging/runtime', () => ({ getLogger: () => loggingMocks }))

type MockQueryOptions = {
  initializationResult?: unknown
  close?: () => void
  rewindFiles?: (
    userMessageId: string,
    options?: { dryRun?: boolean },
  ) => Promise<{
    canRewind: boolean
    filesChanged?: string[]
    insertions?: number
    deletions?: number
  }>
  setModel?: (model?: string) => Promise<void>
  streamInput?: (stream: AsyncIterable<unknown>) => Promise<void>
  interrupt?: () => Promise<void>
  throwAtStart?: Error
}

function createMockQuery(messages: unknown[], options: MockQueryOptions = {}) {
  async function* iterate() {
    if (options.throwAtStart) {
      throw options.throwAtStart
    }

    for (const message of messages) {
      yield message
    }
  }

  return Object.assign(iterate(), {
    initializationResult: vi.fn(async () => options.initializationResult),
    close: vi.fn(options.close ?? (() => {})),
    rewindFiles: vi.fn(
      options.rewindFiles ??
        (async () => ({
          canRewind: false,
        })),
    ),
    setModel: vi.fn(options.setModel ?? (async () => {})),
    streamInput: vi.fn(options.streamInput ?? (async () => {})),
    interrupt: vi.fn(options.interrupt ?? (async () => {})),
  })
}

function createPendingMockQuery() {
  const iterator: AsyncIterableIterator<never> = {
    next: () => new Promise<IteratorResult<never>>(() => {}),
    [Symbol.asyncIterator]() {
      return this
    },
  }

  return Object.assign(iterator, {
    close: vi.fn(),
    setModel: vi.fn(async () => {}),
    interrupt: vi.fn(async () => {}),
  })
}

function createClosablePendingMockQuery() {
  let finish: ((result: IteratorResult<never>) => void) | undefined
  const iterator: AsyncIterableIterator<never> = {
    next: () =>
      new Promise<IteratorResult<never>>((resolve) => {
        finish = resolve
      }),
    [Symbol.asyncIterator]() {
      return this
    },
  }

  return Object.assign(iterator, {
    close: vi.fn(() => finish?.({ done: true, value: undefined })),
    setModel: vi.fn(async () => {}),
    interrupt: vi.fn(async () => {}),
  })
}

// Yield after one system/init event to simulate a ready child process that is generating output.
function createMockQueryInitThenPending(
  initMessage: unknown,
  options: { interrupt?: () => Promise<void> } = {},
) {
  let yieldedInit = false
  const iterator = {
    next(): Promise<IteratorResult<unknown>> {
      if (!yieldedInit) {
        yieldedInit = true
        return Promise.resolve({ done: false, value: initMessage })
      }
      return new Promise<IteratorResult<unknown>>(() => {})
    },
    [Symbol.asyncIterator]() {
      return this
    },
  }
  return Object.assign(iterator, {
    close: vi.fn(),
    interrupt: vi.fn(options.interrupt ?? (async () => {})),
    setModel: vi.fn(async () => {}),
  })
}

function createEvents(): ClaudeEventSink {
  return {
    onOutput: vi.fn(),
    onError: vi.fn(),
    onComplete: vi.fn(),
    onToolRequest: vi.fn(),
  }
}

const proxy = {
  baseURL: 'http://127.0.0.1:43123',
  authToken: 'local-proxy-secret',
  settingsEnv: vi.fn((model?: string) => ({
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_AUTH_TOKEN: 'local-proxy-secret',
    ANTHROPIC_BASE_URL: 'http://127.0.0.1:43123',
    ANTHROPIC_DEFAULT_SONNET_MODEL: 'zhipu/glm-5.2/fast',
    ...(model === 'zhipu/glm-5.2/fast'
      ? {
          CLAUDE_CODE_AUTO_COMPACT_WINDOW: '200000',
          CLAUDE_CODE_MAX_CONTEXT_TOKENS: '200000',
        }
      : {}),
  })),
}

describe('Claude SDK runner', () => {
  beforeEach(() => {
    vi.mocked(sdkQuery).mockReset()
    loggingMocks.error.mockClear()
    loggingMocks.info.mockClear()
    proxy.settingsEnv.mockClear()
  })

  it('starts SDK discovery with the native Claude environment', async () => {
    vi.mocked(sdkQuery).mockReturnValue(
      createMockQuery([], {
        initializationResult: {
          commands: [],
          agents: [],
          models: [],
        },
      }) as never,
    )

    await startup({ options: { cwd: '/tmp/app' } })

    expect(vi.mocked(sdkQuery).mock.calls[0]?.[0].options).not.toHaveProperty('settings')
    expect(proxy.settingsEnv).not.toHaveBeenCalled()
  })

  it('routes Claude models directly and custom provider models through the proxy', async () => {
    vi.mocked(sdkQuery)
      .mockReturnValueOnce(createMockQuery([]) as never)
      .mockReturnValueOnce(createMockQuery([]) as never)

    startQuery(
      createEvents(),
      {
        streamId: 'official-stream',
        prompt: 'hello',
        options: { cwd: '/tmp/app', model: 'claude/claude-sonnet-4-6' },
      },
      proxy,
    )
    startQuery(
      createEvents(),
      {
        streamId: 'custom-stream',
        prompt: 'hello',
        options: { cwd: '/tmp/app', model: 'zhipu/glm-5.2/fast' },
      },
      proxy,
    )

    const official = vi.mocked(sdkQuery).mock.calls[0]?.[0].options
    expect(official?.model).toBe('claude-sonnet-4-6')
    expect(official).not.toHaveProperty('settings')

    const custom = vi.mocked(sdkQuery).mock.calls[1]?.[0].options
    expect(custom?.model).toBe('zhipu/glm-5.2/fast')
    expect(custom?.settings).toEqual({ env: proxy.settingsEnv('zhipu/glm-5.2/fast') })
  })

  it('previews or applies file rewind against a completed session without creating a new session', async () => {
    const rewindFiles = vi.fn(async () => ({
      canRewind: true,
      filesChanged: ['src/app.tsx'],
      insertions: 2,
      deletions: 4,
    }))
    const close = vi.fn()
    vi.mocked(sdkQuery).mockReturnValue(
      createMockQuery([], {
        close,
        initializationResult: {},
        rewindFiles,
      }) as never,
    )
    const rewindSessionFiles = (
      runnerApi as typeof runnerApi & {
        rewindSessionFiles?: (
          params: {
            cwd: string
            sessionId: string
            userMessageId: string
            dryRun?: boolean
          },
          connection: typeof proxy,
        ) => Promise<{
          canRewind: boolean
          filesChanged?: string[]
          insertions?: number
          deletions?: number
        }>
      }
    ).rewindSessionFiles

    await expect(
      rewindSessionFiles?.(
        {
          cwd: '/tmp/app',
          sessionId: 'same-session',
          userMessageId: 'target-user-uuid',
          dryRun: true,
        },
        proxy,
      ),
    ).resolves.toEqual({
      canRewind: true,
      filesChanged: ['src/app.tsx'],
      insertions: 2,
      deletions: 4,
    })
    expect(sdkQuery).toHaveBeenCalledWith({
      prompt: expect.any(Object),
      options: expect.objectContaining({
        cwd: '/tmp/app',
        enableFileCheckpointing: true,
        resume: 'same-session',
      }),
    })
    expect(rewindFiles).toHaveBeenCalledWith('target-user-uuid', { dryRun: true })
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes a historical rewind query when SDK initialization times out', async () => {
    vi.useFakeTimers()
    const close = vi.fn()
    vi.mocked(sdkQuery).mockReturnValue(
      createMockQuery([], {
        close,
        initializationResult: new Promise(() => {}),
      }) as never,
    )

    const pending = runnerApi.rewindSessionFiles({
      cwd: '/tmp/app',
      sessionId: 'same-session',
      userMessageId: 'target-user-uuid',
      dryRun: true,
      initializeTimeoutMs: 25,
    })
    const rejection = expect(pending).rejects.toThrow(
      'Claude rewind initialization timed out after 25ms',
    )
    await vi.advanceTimersByTimeAsync(25)

    await rejection
    expect(close).toHaveBeenCalledOnce()
    vi.useRealTimers()
  })

  it('reports SDK query errors through the event sink', async () => {
    const events = createEvents()
    vi.mocked(sdkQuery).mockReturnValue(
      createMockQuery([], { throwAtStart: new Error('model unavailable') }) as never,
    )

    startQuery(
      events,
      {
        streamId: 'stream-1',
        prompt: 'hello',
        options: { cwd: '/tmp/app', model: 'missing-model' },
      },
      proxy,
    )
    await vi.waitFor(() => expect(events.onComplete).toHaveBeenCalledWith('stream-1', false))

    expect(events.onError).toHaveBeenCalledWith(
      'stream-1',
      'model unavailable',
      expect.stringContaining('model unavailable'),
    )
  })

  it('reports an SDK structured error result as a failed query', async () => {
    const events = createEvents()
    const resultError = {
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      errors: ['prompt is too long', 'remove an attachment and retry'],
      terminal_reason: 'prompt_too_long',
    }
    vi.mocked(sdkQuery).mockReturnValue(createMockQuery([resultError]) as never)

    startQuery(
      events,
      {
        streamId: 'stream-1',
        prompt: 'hello',
        options: { cwd: '/tmp/app', model: 'sonnet' },
      },
      proxy,
    )
    await vi.waitFor(() => expect(events.onComplete).toHaveBeenCalledWith('stream-1', false))

    expect(events.onOutput).toHaveBeenCalledWith('stream-1', resultError)
    expect(events.onError).toHaveBeenCalledWith(
      'stream-1',
      'prompt is too long\nremove an attachment and retry',
      expect.stringContaining('prompt is too long'),
    )
    expect(events.onComplete).not.toHaveBeenCalledWith('stream-1', true)
  })

  it('loads background task output before forwarding its terminal notification', async () => {
    const outputDirectory = await mkdtemp(path.join(tmpdir(), 'clotho-task-output-'))
    const outputFile = path.join(outputDirectory, 'task-1.output')
    await writeFile(outputFile, 'build completed\n', 'utf8')
    const events = createEvents()
    const notification = {
      type: 'system',
      subtype: 'task_notification',
      task_id: 'task-1',
      tool_use_id: 'bash-1',
      output_file: outputFile,
      status: 'completed',
      summary: 'Background command completed (exit code 0)',
    }
    vi.mocked(sdkQuery).mockReturnValue(createMockQuery([notification]) as never)

    try {
      startQuery(
        events,
        {
          streamId: 'stream-1',
          prompt: 'hello',
          options: { cwd: '/tmp/app', model: 'sonnet' },
        },
        proxy,
      )
      await vi.waitFor(() => expect(events.onComplete).toHaveBeenCalledWith('stream-1', true))

      expect(events.onOutput).toHaveBeenCalledWith('stream-1', {
        ...notification,
        result: 'build completed\n',
      })
    } finally {
      await rm(outputDirectory, { recursive: true, force: true })
    }
  })

  it('aborts the query when interrupted before the subprocess initializes', async () => {
    const events = createEvents()
    const pendingQuery = createPendingMockQuery()
    vi.mocked(sdkQuery).mockReturnValue(pendingQuery as never)

    startQuery(
      events,
      { streamId: 'stream-1', prompt: 'hello', options: { cwd: '/tmp/app', model: 'sonnet' } },
      proxy,
    )
    const abortController = vi.mocked(sdkQuery).mock.calls[0]?.[0].options?.abortController
    expect(abortController).toBeInstanceOf(AbortController)

    await controlQuery({ streamId: 'stream-1', command: 'interrupt' })

    // interrupt() is discarded before init; use abort as the fallback.
    expect(abortController?.signal.aborted).toBe(true)
    expect(pendingQuery.interrupt).not.toHaveBeenCalled()
    closeQuery('stream-1')
  })

  it('interrupts the SDK query after the subprocess initializes', async () => {
    const events = createEvents()
    const interrupt = vi.fn(async () => {})
    const initMessage = { type: 'system', subtype: 'init', session_id: 'session-1' }
    vi.mocked(sdkQuery).mockReturnValue(
      createMockQueryInitThenPending(initMessage, { interrupt }) as never,
    )

    startQuery(
      events,
      { streamId: 'stream-1', prompt: 'hello', options: { cwd: '/tmp/app', model: 'sonnet' } },
      proxy,
    )
    await vi.waitFor(() => expect(events.onOutput).toHaveBeenCalledWith('stream-1', initMessage))
    const abortController = vi.mocked(sdkQuery).mock.calls[0]?.[0].options?.abortController

    await controlQuery({ streamId: 'stream-1', command: 'interrupt' })

    // After init the child process is ready, so interrupt() is reliable and graceful.
    expect(interrupt).toHaveBeenCalledOnce()
    expect(abortController?.signal.aborted).toBe(false)
    closeQuery('stream-1')
  })

  it('keeps another query active when one concurrent stream closes', async () => {
    const firstQuery = createPendingMockQuery()
    const secondQuery = createPendingMockQuery()
    vi.mocked(sdkQuery)
      .mockReturnValueOnce(firstQuery as never)
      .mockReturnValueOnce(secondQuery as never)

    startQuery(createEvents(), { streamId: 'stream-1', prompt: 'first' }, proxy)
    startQuery(createEvents(), { streamId: 'stream-2', prompt: 'second' }, proxy)

    closeQuery('stream-1')

    expect(firstQuery.close).toHaveBeenCalledOnce()
    expect(secondQuery.close).not.toHaveBeenCalled()
    await expect(
      controlQuery({ streamId: 'stream-1', command: 'setModel', params: ['opus'] }),
    ).rejects.toThrow('Claude query stream not found: stream-1')
    await controlQuery({ streamId: 'stream-2', command: 'setModel', params: ['opus'] })
    expect(secondQuery.setModel).toHaveBeenCalledWith('opus')

    closeQuery('stream-2')
  })

  it('logs one cancelled terminal event when an active query closes', async () => {
    const events = createEvents()
    const query = createClosablePendingMockQuery()
    vi.mocked(sdkQuery).mockReturnValue(query as never)
    startQuery(events, { streamId: 'stream-1', prompt: 'hello' }, proxy)
    loggingMocks.info.mockClear()

    closeQuery('stream-1')
    await vi.waitFor(() => expect(events.onComplete).toHaveBeenCalled())

    const terminalEvents = loggingMocks.info.mock.calls
      .map(([event]) => event)
      .filter((event) => event === 'query.cancelled' || event === 'query.completed')
    expect(terminalEvents).toEqual(['query.cancelled'])
  })

  it('waits for the SDK stream to finish before resolving close', async () => {
    let finish!: (result: IteratorResult<never>) => void
    const query = {
      next: () =>
        new Promise<IteratorResult<never>>((resolve) => {
          finish = resolve
        }),
      [Symbol.asyncIterator]() {
        return this
      },
      close: vi.fn(),
      interrupt: vi.fn(async () => {}),
    }
    vi.mocked(sdkQuery).mockReturnValue(query as never)

    const events = createEvents()
    startQuery(events, { streamId: 'stream-1', prompt: 'hello' }, proxy)
    const closing = closeQuery('stream-1')
    await Promise.resolve()
    expect(events.onComplete).not.toHaveBeenCalled()

    finish({ done: true, value: undefined })
    await closing
    expect(events.onComplete).toHaveBeenCalledWith('stream-1', true)
  })

  it('waits for asynchronous SDK disposal after the message stream has ended', async () => {
    const query = createClosablePendingMockQuery()
    let finishDisposal!: () => void
    const disposed = new Promise<void>((resolve) => {
      finishDisposal = resolve
    })
    Object.assign(query, { [Symbol.asyncDispose]: vi.fn(() => disposed) })
    vi.mocked(sdkQuery).mockReturnValue(query as never)
    const events = createEvents()
    startQuery(events, { streamId: 'stream-1', prompt: 'hello' }, proxy)

    let isClosed = false
    const closing = closeQuery('stream-1').then(() => {
      isClosed = true
    })
    await vi.waitFor(() => expect(events.onComplete).toHaveBeenCalled())
    expect(isClosed).toBe(false)

    finishDisposal()
    await closing
    expect(isClosed).toBe(true)
  })

  it('waits for the child exit even when SDK disposal has already resolved', async () => {
    let finishExit!: () => void
    const exited = new Promise<void>((resolve) => {
      finishExit = resolve
    })
    const processSpy = vi.spyOn(queryProcessApi, 'createQueryProcess').mockReturnValueOnce({
      spawn: vi.fn(),
      waitForExit: () => exited,
      stderr: () => '',
    })
    try {
      const query = createClosablePendingMockQuery()
      Object.assign(query, { [Symbol.asyncDispose]: vi.fn(async () => {}) })
      vi.mocked(sdkQuery).mockReturnValue(query as never)
      const events = createEvents()
      startQuery(events, { streamId: 'stream-1', prompt: 'hello' }, proxy)
      let isClosed = false
      const closing = closeQuery('stream-1').then(() => {
        isClosed = true
      })
      await vi.waitFor(() => expect(events.onComplete).toHaveBeenCalled())
      expect(isClosed).toBe(false)
      finishExit()
      await closing
      expect(isClosed).toBe(true)
    } finally {
      finishExit()
      processSpy.mockRestore()
    }
  })

  it('routes equal tool ids to the query stream that requested them', async () => {
    const firstEvents = createEvents()
    const secondEvents = createEvents()
    vi.mocked(sdkQuery)
      .mockReturnValueOnce(createMockQuery([]) as never)
      .mockReturnValueOnce(createMockQuery([]) as never)

    startQuery(firstEvents, { streamId: 'stream-1', prompt: 'first' }, proxy)
    startQuery(secondEvents, { streamId: 'stream-2', prompt: 'second' }, proxy)

    const firstCanUseTool = vi.mocked(sdkQuery).mock.calls[0]?.[0].options?.canUseTool
    const secondCanUseTool = vi.mocked(sdkQuery).mock.calls[1]?.[0].options?.canUseTool
    const firstAbort = new AbortController()
    const secondAbort = new AbortController()
    const firstResult = firstCanUseTool?.(
      'Write',
      {},
      {
        signal: firstAbort.signal,
        toolUseID: 'shared-tool-id',
        requestId: 'request-1',
      },
    )
    const secondResult = secondCanUseTool?.(
      'Write',
      {},
      {
        signal: secondAbort.signal,
        toolUseID: 'shared-tool-id',
        requestId: 'request-2',
      },
    )

    respondToolRequest('stream-1', 'shared-tool-id', { behavior: 'allow' })
    await expect(firstResult).resolves.toEqual({ behavior: 'allow', updatedInput: {} })
    expect(firstEvents.onToolRequest).toHaveBeenCalledWith(
      'stream-1',
      expect.objectContaining({ toolUseId: 'shared-tool-id' }),
    )

    respondToolRequest('stream-2', 'shared-tool-id', { behavior: 'deny', message: 'No' })
    await expect(secondResult).resolves.toEqual({ behavior: 'deny', message: 'No' })
    expect(secondEvents.onToolRequest).toHaveBeenCalledWith(
      'stream-2',
      expect.objectContaining({ toolUseId: 'shared-tool-id' }),
    )
  })

  it('omits canUseTool under bypassPermissions where the callback would be shadowed', async () => {
    const events = createEvents()
    vi.mocked(sdkQuery)
      .mockReturnValueOnce(createMockQuery([]) as never)
      .mockReturnValueOnce(createMockQuery([]) as never)

    startQuery(events, { streamId: 'stream-1', prompt: 'first' }, proxy)
    startQuery(
      events,
      {
        streamId: 'stream-2',
        prompt: 'second',
        options: { permissionMode: 'bypassPermissions' },
      },
      proxy,
    )

    expect(vi.mocked(sdkQuery).mock.calls[0]?.[0].options?.canUseTool).toBeTypeOf('function')
    expect(vi.mocked(sdkQuery).mock.calls[1]?.[0].options?.canUseTool).toBeUndefined()
  })

  it('registers a pending tool request before notifying the host', async () => {
    const events = createEvents()
    vi.mocked(events.onToolRequest).mockImplementation((streamId, request) => {
      respondToolRequest(streamId, request.toolUseId, { behavior: 'allow' })
    })
    vi.mocked(sdkQuery).mockReturnValue(createMockQuery([]) as never)

    startQuery(events, { streamId: 'stream-1', prompt: 'write' }, proxy)
    const canUseTool = vi.mocked(sdkQuery).mock.calls[0]?.[0].options?.canUseTool
    const result = canUseTool?.(
      'Write',
      {},
      {
        signal: new AbortController().signal,
        toolUseID: 'tool-1',
        requestId: 'request-1',
      },
    )

    await expect(result).resolves.toEqual({ behavior: 'allow', updatedInput: {} })
  })

  it('bridges serializable streamInput messages into the active SDK query', async () => {
    const events = createEvents()
    const received: unknown[] = []
    vi.mocked(sdkQuery).mockReturnValue(
      createMockQuery([], {
        streamInput: async (stream) => {
          for await (const message of stream) {
            received.push(message)
          }
        },
      }) as never,
    )

    startQuery(
      events,
      {
        streamId: 'stream-1',
        prompt: 'hello',
        options: { cwd: '/tmp/app', model: 'sonnet' },
      },
      proxy,
    )
    await startQueryInputStream({ streamId: 'stream-1', inputStreamId: 'input-1' })
    pushQueryInputMessage({
      streamId: 'stream-1',
      inputStreamId: 'input-1',
      message: {
        type: 'user',
        parent_tool_use_id: null,
        message: { role: 'user', content: 'next' },
      },
    })
    completeQueryInputStream({ streamId: 'stream-1', inputStreamId: 'input-1' })

    await vi.waitFor(() =>
      expect(received).toEqual([
        { type: 'user', parent_tool_use_id: null, message: { role: 'user', content: 'next' } },
      ]),
    )
  })
})
