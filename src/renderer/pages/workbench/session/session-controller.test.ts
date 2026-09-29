import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ClaudeAttachment } from '@/shared/rpc'

import type {
  ClaudeContextUsageSnapshot,
  ClaudeInitializationResult,
  ClaudeModelMappings,
  ClaudePermissionMode,
  ClaudeRewindFilesResult,
  ClaudeSdkMessage,
  ClaudeSessionEditAnchor,
  ClaudeSessionStream,
  ClaudeSessionStreamPushParams,
  ClaudeSessionStreamState,
  ClaudeToolRequest,
  ModelProvider,
} from '../../../services/claude/claude'
import { createModelConfigurationStore } from '../../../stores/model-configuration-store'
import { createSessionPersistence } from '../services/session-persistence'
import { createSessionController } from './session-controller'
import type { SessionControllerOptions } from './session-types'
import { initialUsageState } from './stores/usage-store'

function createMemoryPersistence() {
  return createSessionPersistence(undefined)
}

function createClient() {
  return {
    deleteSession: vi.fn(async () => {}),
    dropTrailingTurn: vi.fn(async (): Promise<{ dropped: boolean; removedSession: boolean }> => ({
      dropped: true,
      removedSession: false,
    })),
    getSessionEditAnchor: vi.fn(async (): Promise<ClaudeSessionEditAnchor> => ({
      strategy: 'resume',
      resumeSessionAt: 'parent-message-uuid',
    })),
    loadSessionHistory: vi.fn(async () => []),
    prepareAttachments: vi.fn(async (): Promise<{ attachments: ClaudeAttachment[] }> => ({
      attachments: [],
    })),
    rewindSessionFiles: vi.fn(async (): Promise<ClaudeRewindFilesResult> => ({
      canRewind: true,
      filesChanged: [],
      insertions: 0,
      deletions: 0,
    })),
    startup: vi.fn(async (): Promise<ClaudeInitializationResult> => ({
      cwd: '/Users/me/project',
      resume: 'claude-session',
      commands: [{ name: '/help', description: 'Show help' }],
      agents: [{ name: 'reviewer', description: 'Review code' }],
      models: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Balanced' }],
    })),
    listModelMappings: vi.fn(async (): Promise<ClaudeModelMappings> => ({})),
    query: vi.fn(() => {
      throw new Error('query is not expected in this test')
    }),
    openSessionStream: vi.fn(() => {
      throw new Error('openSessionStream is not expected in this test')
    }),
    rebuildSessionStream: vi.fn(() => {
      throw new Error('rebuildSessionStream is not expected in this test')
    }),
    setProjectModel: vi.fn(async () => {}),
    listProviders: vi.fn(async (): Promise<ModelProvider[]> => []),
    sampleContextUsage: vi.fn(async (): Promise<ClaudeContextUsageSnapshot | null> => null),
    setSessionQueryModel: vi.fn(async () => ({ applied: true as const })),
  }
}

let successfulQueryIndex = 0

function userHistoryMessage(content: string) {
  successfulQueryIndex++
  return {
    type: 'user',
    uuid: `persisted-user-${successfulQueryIndex}`,
    message: { role: 'user', content },
  }
}

const successResult = () => ({ type: 'result', subtype: 'success' })
const interruptResult = () => ({
  type: 'result',
  subtype: 'error_during_execution',
  is_error: true,
})

type StreamHarness = {
  stream: ClaudeSessionStream
  pushes: ClaudeSessionStreamPushParams[]
  emit(frame: unknown): void
  emitResult(): void
  fail(error: Error): void
  finish(): void
  emitRequest(request: ClaudeToolRequest): void
}

type StreamScript = (params: ClaudeSessionStreamPushParams, harness: StreamHarness) => void

let streamCounter = 0

/**
 * Emulates the main-process resident query: one long-lived generator whose
 * turns are driven by pushes. A turn ends on a result frame (or when the
 * stream dies); the stream itself stays alive in between.
 */
function createStreamHarness(
  options: { script?: StreamScript; onInterrupt?: 'result' | 'none' } = {},
) {
  type Item = { done: true; error?: Error } | { done: false; value: unknown }
  const queued: Item[] = []
  const waiters: Array<(item: Item) => void> = []
  const deliver = (item: Item) => {
    const waiter = waiters.shift()
    if (waiter) waiter(item)
    else queued.push(item)
  }
  async function* iterate() {
    while (true) {
      const item = queued.shift() ?? (await new Promise<Item>((resolve) => waiters.push(resolve)))
      if (item.done) {
        if (item.error) throw item.error
        return
      }
      yield item.value
    }
  }
  const iterator = iterate()
  const toolHandlers = new Set<(request: ClaudeToolRequest) => void>()
  const state: ClaudeSessionStreamState = {
    claudeSessionId: null,
    status: 'ready',
    turnInFlight: false,
    pendingToolRequests: [],
    backgroundTaskIds: [],
  }
  const pushes: ClaudeSessionStreamPushParams[] = []
  const harness = {} as StreamHarness
  const stream: ClaudeSessionStream = {
    sessionId: 'test-session',
    streamId: `stream-${++streamCounter}`,
    [Symbol.asyncIterator]: () => iterator as unknown as AsyncGenerator<ClaudeSdkMessage, void>,
    async [Symbol.asyncDispose]() {
      harness.finish()
    },
    next: () => iterator.next() as Promise<IteratorResult<ClaudeSdkMessage, void>>,
    async throw(error?: unknown) {
      harness.fail(error instanceof Error ? error : new Error(String(error ?? 'Stream failed')))
      return { done: true as const, value: undefined }
    },
    async return() {
      harness.finish()
      return { done: true as const, value: undefined }
    },
    getState: () => state,
    async push(params) {
      pushes.push(params)
      options.script?.(params, harness)
    },
    subscribeToolRequests(handler) {
      toolHandlers.add(handler)
      return () => toolHandlers.delete(handler)
    },
    respondToolRequest: vi.fn(async () => {}),
    interrupt: vi.fn(async () => {
      if ((options.onInterrupt ?? 'result') === 'result')
        deliver({ done: false, value: interruptResult() })
    }),
    setPermissionMode: vi.fn(async () => {}),
    setModel: vi.fn(async () => {}),
    setMaxThinkingTokens: vi.fn(async () => {}),
    applyFlagSettings: vi.fn(async () => {}),
    getContextUsage: vi.fn(async (): Promise<ClaudeContextUsageSnapshot | null> => null),
    stopTask: vi.fn(async () => {}),
    detach: vi.fn(() => {
      deliver({ done: true })
    }),
  }
  Object.assign(harness, {
    stream,
    pushes,
    emit: (frame: unknown) => deliver({ done: false, value: frame }),
    emitResult: () => deliver({ done: false, value: successResult() }),
    fail: (error: Error) => deliver({ done: true, error }),
    finish: () => deliver({ done: true }),
    emitRequest: (request: ClaudeToolRequest) => {
      for (const handler of [...toolHandlers]) handler(request)
    },
  })
  return harness
}

/** Each push replays the user echo and a success result, like a completed turn. */
function createSuccessfulStream() {
  return createStreamHarness({
    script: (params, harness) => {
      harness.emit(userHistoryMessage(params.text))
      harness.emitResult()
    },
  })
}

/** The test drives every frame by hand; interrupt ends the turn like the CLI. */
function createManualStream(options: { finishOnInterrupt?: boolean } = {}) {
  return createStreamHarness({
    onInterrupt: options.finishOnInterrupt === false ? 'none' : 'result',
  })
}

/** Every push kills the stream with the given technical error. */
function createFailingStream(error: Error) {
  return createStreamHarness({
    script: (_params, harness) => {
      harness.fail(error)
    },
  })
}

function createOptions(sessionId: string) {
  return {
    sessionId,
    claudeSessionId: null,
    projectId: 'project-1',
    projectPath: '/Users/me/project',
    isHomeMode: false,
    isMockProject: false,
  }
}

const controllers: ReturnType<typeof createSessionController>[] = []

function trackedStore(options: SessionControllerOptions) {
  const controller = createSessionController(options)
  controllers.push(controller)
  return {
    getState: () => ({
      ...controller.contextStore.getState(),
      ...controller.composerStore.getState(),
      ...controller.conversationStore.getState(),
      ...controller.runtimeStore.getState(),
      ...controller.catalogStore.getState(),
      ...controller.modelConfigurationStore.getState(),
      syncContext: controller.syncContext,
      initialize: controller.initialize,
      retryInitialize: controller.retryInitialize,
      setPrompt: controller.setPrompt,
      setAttachments: controller.setAttachments,
      setSelectedProviderModel: controller.setSelectedProviderModel,
      setSelectedAgent: controller.setSelectedAgent,
      setPermissionMode: controller.setPermissionMode,
      resetPreferences: controller.resetPreferences,
      ingestLine: controller.ingestLine,
      ingestError: controller.ingestError,
      commitUserMessage: controller.commitUserMessage,
      resetConversation: controller.resetConversation,
      toggleTurn: controller.toggleTurn,
      refreshModels: controller.refreshModels,
      sendPrompt: controller.sendPrompt,
      resumeInterrupted: controller.resumeInterrupted,
      sendSlashCommand: controller.sendService.sendSlashCommand.bind(controller.sendService),
      prepareMessageEdit: controller.prepareMessageEdit,
      submitMessageEdit: controller.submitMessageEdit,
      cancelMessageEdit: controller.cancelMessageEdit,
      stopStreaming: controller.stopStreaming,
      respondToolRequest: controller.respondToolRequest,
      dispose: () => controller.dispose(),
    }),
    setState: controller.runtimeStore.setState,
  }
}

afterEach(() => {
  for (const controller of controllers.splice(0)) controller.dispose()
  vi.useRealTimers()
})

describe('SessionController', () => {
  it('does not notify conversation subscribers for replayed transcript entries', () => {
    const controller = createSessionController({
      ...createOptions('local:history-replay'),
      claudeSessionId: 'claude-history',
      client: createClient(),
    })
    controllers.push(controller)

    let notifications = 0
    const unsubscribe = controller.conversationStore.subscribe(() => {
      notifications += 1
    })
    const line = JSON.stringify({
      type: 'assistant',
      uuid: 'assistant-replayed-once',
      message: { role: 'assistant', content: [{ type: 'text', text: '你好！' }] },
    })

    controller.ingestLine(line)
    const notificationsAfterFirstEntry = notifications
    controller.ingestLine(line)
    unsubscribe()

    expect(notificationsAfterFirstEntry).toBe(1)
    expect(notifications).toBe(notificationsAfterFirstEntry)
  })

  it('starts a new session instead of querying Claude for a typed /clear command', async () => {
    const client = createClient()
    const onStartNewSession = vi.fn()
    const options = {
      ...createOptions('local:typed-clear'),
      claudeSessionId: 'claude-session',
      client,
      onStartNewSession,
    } as SessionControllerOptions
    const store = trackedStore(options)
    store.getState().setPrompt('  /clear  ')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).not.toHaveBeenCalled()
    expect(onStartNewSession).toHaveBeenCalledOnce()
    expect(store.getState().prompt).toBe('')
  })

  it('starts a new session and carries the draft for the clear menu command', async () => {
    const client = createClient()
    const onStartNewSession = vi.fn()
    const options = {
      ...createOptions('local:menu-clear'),
      claudeSessionId: 'claude-session',
      client,
      onStartNewSession,
    } as SessionControllerOptions
    const store = trackedStore(options)
    store.getState().setPrompt('Keep this draft')

    await store.getState().sendSlashCommand('/clear')

    expect(client.openSessionStream).not.toHaveBeenCalled()
    expect(onStartNewSession).toHaveBeenCalledOnce()
    expect(onStartNewSession).toHaveBeenCalledWith({
      prompt: 'Keep this draft',
      attachments: [],
    })
    expect(store.getState().prompt).toBe('')
  })

  it('retains captured historical attachments outside the editor until a retry succeeds', async () => {
    const client = createClient()
    const captured: ClaudeAttachment[] = [
      {
        name: 'notes.txt',
        content: {
          type: 'document',
          source: { type: 'text', media_type: 'text/plain', data: 'Before rewind' },
        },
      },
    ]
    client.prepareAttachments.mockResolvedValue({ attachments: captured })
    const failing = createFailingStream(new Error('Offline after rewind'))
    const successful = createSuccessfulStream()
    client.rebuildSessionStream
      .mockReturnValueOnce(failing.stream as never)
      .mockReturnValueOnce(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:retry-upload'),
      claudeSessionId: 'claude-session',
      client,
    })
    store.getState().commitUserMessage({
      id: 'original',
      uuid: 'original-uuid',
      role: 'user',
      content: 'Original',
    })
    const anchor = { strategy: 'resume' as const, resumeSessionAt: 'parent' }

    expect(
      await store.getState().submitMessageEdit(
        {
          messageId: 'original',
          messageUuid: 'original-uuid',
          prompt: 'Edited prompt',
          providerId: 'zhipu',
          modelId: 'glm-5.2',
          permissionMode: 'default',
          attachments: [{ name: 'notes.txt', path: '/project/notes.txt' }],
        },
        anchor,
        true,
      ),
    ).toBe(false)

    const retry = store.getState().messageEditDraft
    expect(retry).toMatchObject({ prompt: 'Edited prompt', attachments: captured })
    expect(await store.getState().submitMessageEdit(retry!, anchor, false)).toBe(true)
    expect(successful.pushes[0]).toMatchObject({
      text: 'Edited prompt',
      attachments: captured,
    })
    expect(client.prepareAttachments).toHaveBeenCalledTimes(1)
    expect(store.getState().messageEditDraft).toBeNull()
  })

  it.each([false, true])(
    'captures historical uploads before any rewind (read fails: %s)',
    async (readFails) => {
      const client = createClient()
      const uploaded = [{ name: 'notes.txt', path: '/project/notes.txt' }]
      const captured: ClaudeAttachment[] = [
        {
          name: 'notes.txt',
          content: {
            type: 'document',
            title: 'notes.txt',
            source: { type: 'text', media_type: 'text/plain', data: 'Before rewind' },
          },
        },
      ]
      client.prepareAttachments.mockImplementation(async () => {
        if (readFails) throw new Error('Attachment is unreadable')
        return { attachments: captured }
      })
      const successful = createSuccessfulStream()
      client.rebuildSessionStream.mockReturnValue(successful.stream as never)
      const store = trackedStore({
        ...createOptions('local:rewind-upload'),
        claudeSessionId: 'claude-session',
        client,
      })
      store.getState().commitUserMessage({
        id: 'original',
        uuid: 'original-uuid',
        role: 'user',
        content: 'Original',
      })

      const sent = await store.getState().submitMessageEdit(
        {
          messageId: 'original',
          messageUuid: 'original-uuid',
          prompt: 'Edited prompt',
          providerId: 'zhipu',
          modelId: 'glm-5.2',
          permissionMode: 'default',
          attachments: uploaded,
        },
        { strategy: 'resume', resumeSessionAt: 'parent' },
        true,
      )

      expect(client.prepareAttachments).toHaveBeenCalledWith({ attachments: uploaded })
      expect(sent).toBe(!readFails)
      if (readFails) {
        expect(client.rewindSessionFiles).not.toHaveBeenCalled()
        expect(client.rebuildSessionStream).not.toHaveBeenCalled()
      } else {
        expect(client.prepareAttachments.mock.invocationCallOrder[0]).toBeLessThan(
          client.rewindSessionFiles.mock.invocationCallOrder[0]!,
        )
        expect(successful.pushes[0]).toMatchObject({ attachments: captured })
      }
    },
  )

  it('sends attachments without rewriting @ references in the prompt', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({ ...createOptions('local:upload-and-reference'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('Compare @src/app.tsx')
    store.getState().setAttachments([{ name: 'diagram.png', path: '/project/diagram.png' }])

    await store.getState().sendPrompt()

    expect(successful.pushes[0]).toMatchObject({
      text: 'Compare @src/app.tsx',
      attachments: [{ name: 'diagram.png', path: '/project/diagram.png' }],
    })
    expect(store.getState().attachments).toEqual([])
  })

  it('keeps the draft when a model marked without multimodal support receives attachments', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const modelConfigurationStore = createModelConfigurationStore()
    modelConfigurationStore.getState().replaceSettings(
      [
        {
          id: 'zhipu',
          name: 'Zhipu',
          baseURL: 'https://example.com',
          authToken: 'token',
          models: [
            {
              id: 'glm-text',
              displayName: 'GLM Text',
              contextWindow: 200000,
              supportsMultimodal: false,
            },
            { id: 'glm-vision', displayName: 'GLM Vision', contextWindow: 200000 },
          ],
        },
      ],
      {},
    )
    const store = trackedStore({
      ...createOptions('local:no-multimodal'),
      client,
      modelConfigurationStore,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-text')
    store.getState().setPrompt('Check this')
    store.getState().setAttachments([{ name: 'diagram.png', path: '/project/diagram.png' }])

    await store.getState().sendPrompt()

    expect(client.openSessionStream).not.toHaveBeenCalled()
    expect(store.getState().prompt).toBe('Check this')
    expect(store.getState().attachments).toEqual([
      { name: 'diagram.png', path: '/project/diagram.png' },
    ])

    store.getState().setSelectedProviderModel('zhipu', 'glm-vision')
    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledOnce()
    expect(store.getState().attachments).toEqual([])
  })

  it('restores an attachment-only draft when sending fails before history is recorded', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const persistence = createMemoryPersistence()
    const store = trackedStore({ ...createOptions('local:upload-only'), client, persistence })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setAttachments([{ name: 'diagram.png', path: '/project/diagram.png' }])

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    expect(store.getState().attachments).toEqual([])
    controlled.fail(new Error('Upload failed'))
    await sending

    expect(store.getState().attachments).toEqual([
      { name: 'diagram.png', path: '/project/diagram.png' },
    ])
    expect(persistence.get('local:upload-only')?.composer.attachments).toEqual(
      store.getState().attachments,
    )
  })

  it('resends stored attachment contents when editing a historical message', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.rebuildSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:edit-upload'),
      claudeSessionId: 'claude-session',
      client,
    })
    store.getState().commitUserMessage({
      id: 'original',
      uuid: 'original-uuid',
      role: 'user',
      content: 'Original',
    })
    const attachments = [
      {
        name: 'notes.txt',
        content: {
          type: 'document' as const,
          title: 'notes.txt',
          source: {
            type: 'text' as const,
            media_type: 'text/plain' as const,
            data: 'Saved contents',
          },
        },
      },
    ]

    const result = await store.getState().prepareMessageEdit({
      messageId: 'original',
      messageUuid: 'original-uuid',
      prompt: 'Edited prompt',
      providerId: 'zhipu',
      modelId: 'glm-5.2',
      permissionMode: 'default',
      attachments,
    })

    expect(result.status).toBe('sent')
    expect(successful.pushes[0]).toMatchObject({ attachments })
  })

  it('preserves optional defaults when syncing an incomplete options snapshot', () => {
    const controller = createSessionController({
      ...createOptions('local:project-default'),
      defaultProviderId: 'zhipu',
      defaultModelId: 'glm-5.2',
      client: createClient(),
    })
    controllers.push(controller)

    controller.syncOptions({
      ...createOptions('local:project-default'),
      projectPath: '/Users/me/project-next',
      client: controller.claudeService,
    })

    expect(controller.contextStore.getState()).toMatchObject({
      defaultProviderId: 'zhipu',
      defaultModelId: 'glm-5.2',
      projectPath: '/Users/me/project-next',
    })
  })

  it('restores the cached context usage snapshot and keeps it persisted', async () => {
    const cachedSnapshot = {
      model: 'claude-sonnet',
      totalTokens: 1200,
      maxTokens: 200000,
      rawMaxTokens: 200000,
      percentage: 1,
      categories: [{ name: 'Messages', tokens: 1200 }],
    }
    const persistence = createMemoryPersistence()
    await persistence.update('local:usage-cache', (record) => ({
      ...(record ?? {
        id: 'local:usage-cache',
        composer: {
          prompt: '',
          selectedProviderId: null,
          selectedModelId: null,
          selectedAgent: null,
          permissionMode: 'default',
        },
      }),
      contextUsage: { snapshot: cachedSnapshot, anchorMessageId: null },
    }))
    const controller = createSessionController({
      ...createOptions('local:usage-cache'),
      claudeSessionId: 'claude-A',
      persistence,
      client: createClient(),
    })
    controllers.push(controller)

    await controller.initialize()

    // The empty history leaves the anchor at null, matching the cache.
    expect(controller.usageStore.getState().snapshot).toEqual(cachedSnapshot)

    const freshSnapshot = { ...cachedSnapshot, totalTokens: 2400, percentage: 2 }
    controller.usageStore.setState({ snapshot: freshSnapshot })
    await persistence.flush()
    expect(persistence.get('local:usage-cache')?.contextUsage).toEqual({
      snapshot: freshSnapshot,
      anchorMessageId: null,
    })

    controller.usageStore.setState(initialUsageState())
    await persistence.flush()
    expect(persistence.get('local:usage-cache')?.contextUsage).toBeUndefined()
  })

  it('persists context usage with the session associations when creating its local file', async () => {
    const persistence = createMemoryPersistence()
    const controller = createSessionController({
      ...createOptions('local:usage-associations'),
      claudeSessionId: 'claude-A',
      persistence,
      client: createClient(),
    })
    controllers.push(controller)

    controller.usageStore.setState({
      snapshot: {
        model: 'claude-sonnet',
        totalTokens: 1200,
        maxTokens: 200000,
        rawMaxTokens: 200000,
        percentage: 1,
        categories: [{ name: 'Messages', tokens: 1200 }],
      },
    })
    await persistence.flush()

    expect(persistence.get('local:usage-associations')).toMatchObject({
      id: 'local:usage-associations',
      projectId: 'project-1',
      projectPath: '/Users/me/project',
      claudeSessionId: 'claude-A',
    })
  })

  it('discards the cached context usage snapshot when the transcript moved on', async () => {
    const cachedSnapshot = {
      model: 'claude-sonnet',
      totalTokens: 1200,
      maxTokens: 200000,
      rawMaxTokens: 200000,
      percentage: 1,
      categories: [{ name: 'Messages', tokens: 1200 }],
    }
    const persistence = createMemoryPersistence()
    await persistence.update('local:usage-stale', (record) => ({
      ...(record ?? {
        id: 'local:usage-stale',
        composer: {
          prompt: '',
          selectedProviderId: null,
          selectedModelId: null,
          selectedAgent: null,
          permissionMode: 'default',
        },
      }),
      contextUsage: { snapshot: cachedSnapshot, anchorMessageId: 'assistant-old' },
    }))
    const client = createClient()
    client.loadSessionHistory.mockResolvedValue([
      {
        type: 'assistant',
        uuid: 'assistant-final',
        isMeta: false,
        isSidechain: false,
        timestamp: '2026-09-06T10:00:00.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Done' }] },
      },
    ] as never)
    const controller = createSessionController({
      ...createOptions('local:usage-stale'),
      claudeSessionId: 'claude-A',
      persistence,
      client,
    })
    controllers.push(controller)

    await controller.initialize()

    // Another client appended turns after the snapshot was cached, so the
    // anchor no longer matches the transcript's last assistant message.
    expect(controller.usageStore.getState().snapshot).toBeNull()
  })

  it('samples context usage on demand when no query is alive', async () => {
    const snapshot = {
      model: 'claude-sonnet',
      totalTokens: 1200,
      maxTokens: 200000,
      rawMaxTokens: 200000,
      percentage: 1,
      categories: [{ name: 'Messages', tokens: 1200 }],
    }
    const client = createClient()
    let resolveSample: ((value: ClaudeContextUsageSnapshot | null) => void) | undefined
    client.sampleContextUsage.mockReturnValue(
      new Promise<ClaudeContextUsageSnapshot | null>((resolve) => {
        resolveSample = resolve
      }),
    )
    const controller = createSessionController({
      ...createOptions('local:usage-idle'),
      claudeSessionId: 'claude-A',
      persistence: createMemoryPersistence(),
      client,
    })
    controllers.push(controller)

    await controller.initialize()

    // Concurrent clicks share one idle sample instead of spawning a CLI each.
    const samples = Promise.all([
      controller.sendService.fetchContextUsage(),
      controller.sendService.fetchContextUsage(),
    ])

    // The in-flight sample is surfaced to the composer as a loading state.
    expect(controller.usageStore.getState().isSampling).toBe(true)

    resolveSample?.(snapshot)
    await expect(samples).resolves.toEqual([snapshot, snapshot])

    expect(client.sampleContextUsage).toHaveBeenCalledTimes(1)
    expect(client.sampleContextUsage).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'claude-A', cwd: '/Users/me/project' }),
    )
    expect(controller.usageStore.getState().isSampling).toBe(false)
    expect(controller.usageStore.getState().snapshot).toEqual(snapshot)
  })

  it('defaults new sessions to the SDK default permission mode', () => {
    const store = trackedStore({
      ...createOptions('local:default-permission-mode'),
      persistence: createMemoryPersistence(),
      client: createClient(),
    })

    expect(store.getState().permissionMode).toBe('default')
  })

  it('uses the configured global permission mode for a new session', () => {
    const store = trackedStore({
      ...createOptions('local:configured-permission-mode'),
      persistence: createMemoryPersistence(),
      getDefaultPermissionMode: () => 'bypassPermissions',
      client: createClient(),
    })

    expect(store.getState().permissionMode).toBe('bypassPermissions')
  })

  it('persists composer preferences independently for every local session id', async () => {
    const persistence = createMemoryPersistence()
    const first = trackedStore({
      ...createOptions('local:first'),
      persistence,
      client: createClient(),
    })
    const second = trackedStore({
      ...createOptions('local:second'),
      persistence,
      client: createClient(),
    })

    first.getState().setPrompt('first draft')
    first.getState().setSelectedProviderModel('p1', 'opus')
    first.getState().setSelectedAgent('reviewer')
    second.getState().setPrompt('second draft')
    await persistence.flush()

    expect(persistence.get('local:first')?.composer).toEqual({
      prompt: 'first draft',
      selectedProviderId: 'p1',
      selectedModelId: 'opus',
      selectedAgent: 'reviewer',
      permissionMode: 'default',
    })
    expect(persistence.get('local:second')?.composer).toEqual({
      prompt: 'second draft',
      selectedProviderId: null,
      selectedModelId: null,
      selectedAgent: null,
      permissionMode: 'default',
    })

    const restored = trackedStore({
      ...createOptions('local:first'),
      persistence,
      client: createClient(),
    })
    expect(restored.getState()).toMatchObject({
      prompt: 'first draft',
      selectedProviderId: 'p1',
      selectedModelId: 'opus',
      selectedAgent: 'reviewer',
    })
  })

  it('contains a failed direct project model save without an unhandled rejection', async () => {
    const client = createClient()
    client.setProjectModel.mockRejectedValue(new Error('write failed'))
    const store = trackedStore({
      ...createOptions('local:failed-project-model-save'),
      client,
    })

    store.getState().setSelectedProviderModel('provider', 'model-b')

    await vi.waitFor(() => {
      expect(client.setProjectModel).toHaveBeenCalledWith({
        projectId: 'project-1',
        providerId: 'provider',
        modelId: 'model-b',
      })
    })
  })

  it('reports prompt edits so the workbench can refresh a draft timestamp', () => {
    const onPromptEdited = vi.fn()
    const store = trackedStore({
      ...createOptions('local:draft'),
      client: createClient(),
      onPromptEdited,
    })

    store.getState().setPrompt('Updated draft')

    expect(onPromptEdited).toHaveBeenCalledOnce()
    expect(onPromptEdited).toHaveBeenCalledWith('local:draft')
  })

  it('loads existing history without resuming the session during startup', async () => {
    const client = createClient()
    const store = trackedStore({
      ...createOptions('local:stable-id'),
      claudeSessionId: 'claude-existing-id',
      client,
    })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(client.loadSessionHistory).toHaveBeenCalledWith('claude-existing-id', 'project-1')
    expect(client.loadSessionHistory).toHaveBeenCalledTimes(1)
    expect(client.startup).toHaveBeenCalledWith({
      options: {
        agent: undefined,
        cwd: '/Users/me/project',
        permissionMode: 'default',
      },
      initializeTimeoutMs: 60_000,
    })
    expect(client.startup).toHaveBeenCalledTimes(1)
    expect(store.getState()).toMatchObject({
      sessionId: 'local:stable-id',
      claudeSessionId: 'claude-existing-id',
      runtimeStatus: 'ready',
      availableModels: [{ value: 'sonnet', displayName: 'Sonnet', description: 'Balanced' }],
    })
  })

  it('passes context additional directories through to the catalog startup options', async () => {
    const client = createClient()
    const store = trackedStore({
      ...createOptions('local:catalog-additional-directories'),
      additionalDirectories: ['/Users/me/docs', '/Users/me/assets'],
      client,
    })

    await store.getState().initialize()

    expect(client.startup).toHaveBeenCalledWith({
      options: expect.objectContaining({
        cwd: '/Users/me/project',
        additionalDirectories: ['/Users/me/docs', '/Users/me/assets'],
      }),
      initializeTimeoutMs: 60_000,
    })
  })

  it('waits for history but not catalog initialization before starting a send', async () => {
    let resolveHistory!: (history: []) => void
    const history = new Promise<[]>((resolve) => {
      resolveHistory = resolve
    })
    const client = createClient()
    client.loadSessionHistory.mockReturnValue(history)
    client.startup.mockReturnValue(new Promise(() => {}))
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:history-gated-send'),
      claudeSessionId: 'claude-existing-id',
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue after history')

    void store.getState().initialize()
    const sending = store.getState().sendPrompt()
    const duplicate = store.getState().sendPrompt()

    expect(duplicate).toBe(sending)

    expect(store.getState()).toMatchObject({
      isHistoryLoading: true,
      isSubmitting: true,
      isStreaming: false,
      messageIds: [],
    })

    resolveHistory([])
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))

    expect(store.getState()).toMatchObject({
      isSubmitting: false,
      messageIds: [expect.stringMatching(/^local-user-/)],
    })

    controlled.emitResult()
    await sending
    expect(client.openSessionStream).toHaveBeenCalledOnce()
  })

  it('preserves the prompt and skips the query when history loading fails', async () => {
    const client = createClient()
    client.loadSessionHistory.mockRejectedValue(new Error('History unavailable'))
    const store = trackedStore({
      ...createOptions('local:history-failure'),
      claudeSessionId: 'claude-existing-id',
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('keep this prompt')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({
      prompt: 'keep this prompt',
      isSubmitting: false,
      isStreaming: false,
      runtimeError: { kind: 'session-initialize', message: 'History unavailable' },
    })
  })

  it('retries session initialization after history loading fails', async () => {
    const client = createClient()
    client.loadSessionHistory
      .mockRejectedValueOnce(new Error('RPC unavailable'))
      .mockResolvedValueOnce([])
    const store = trackedStore({
      ...createOptions('local:retry-initialize'),
      claudeSessionId: 'claude-session',
      client,
    })

    await store.getState().initialize()
    expect(store.getState()).toMatchObject({
      runtimeStatus: 'error',
      runtimeError: { kind: 'session-initialize' },
    })

    await store.getState().retryInitialize()

    expect(client.loadSessionHistory).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({
      runtimeStatus: 'ready',
      runtimeError: null,
    })
  })

  it('loads mock history without starting the native Claude runtime', async () => {
    const client = createClient()
    client.loadSessionHistory.mockResolvedValue([
      {
        type: 'user',
        timestamp: '2026-07-11T07:00:00.000Z',
        message: { role: 'user', content: 'Inspect the mock tools' },
      },
    ] as never)
    const store = trackedStore({
      ...createOptions('mock-web'),
      projectId: 'mock-tools-preview',
      projectPath: '/mock/tools-preview',
      claudeSessionId: 'mock-web',
      isMockProject: true,
      client,
    })

    await store.getState().initialize()

    expect(client.loadSessionHistory).toHaveBeenCalledWith('mock-web', 'mock-tools-preview')
    expect(client.startup).not.toHaveBeenCalled()
    expect(store.getState()).toMatchObject({
      runtimeStatus: 'ready',
      runtimeCwd: '/mock/tools-preview',
      runtimeError: null,
      isHistoryLoading: false,
    })
    expect(store.getState().messageIds).toHaveLength(1)
    expect(Object.values(store.getState().messages)[0]?.content).toBe('Inspect the mock tools')
  })

  it('reloads mock history when a cached mock session is initialized again', async () => {
    const client = createClient()
    client.loadSessionHistory
      .mockResolvedValueOnce([
        {
          type: 'user',
          timestamp: '2026-07-11T07:00:00.000Z',
          message: { role: 'user', content: 'Inspect the mock tools' },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          type: 'user',
          timestamp: '2026-07-11T07:00:00.000Z',
          message: { role: 'user', content: 'Inspect the mock tools' },
        },
        {
          type: 'assistant',
          timestamp: '2026-07-11T09:00:00.000Z',
          message: { role: 'assistant', content: [{ type: 'text', text: 'Updated mock result' }] },
        },
      ] as never)
    const store = trackedStore({
      ...createOptions('mock-web'),
      projectId: 'mock-tools-preview',
      projectPath: '/mock/tools-preview',
      claudeSessionId: 'mock-web',
      isMockProject: true,
      client,
    })

    await store.getState().initialize()
    await store.getState().initialize()

    expect(client.loadSessionHistory).toHaveBeenCalledTimes(2)
    expect(store.getState().messageIds).toHaveLength(2)
    expect(Object.values(store.getState().messages).at(-1)?.content).toBe('Updated mock result')
    expect(client.startup).not.toHaveBeenCalled()
  })

  it('binds a new Claude id without changing the frontend session id', () => {
    const onBindClaudeSession = vi.fn()
    const store = trackedStore({
      ...createOptions('local:draft-id'),
      client: createClient(),
      onBindClaudeSession,
    })

    store
      .getState()
      .ingestLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 'claude-new-id' }))

    expect(store.getState()).toMatchObject({
      sessionId: 'local:draft-id',
      claudeSessionId: 'claude-new-id',
      runtimeResume: 'claude-new-id',
    })
    expect(onBindClaudeSession).toHaveBeenCalledWith('local:draft-id', 'claude-new-id')
  })

  it('reports processing and successful completion to the workbench', async () => {
    const onActivityChange = vi.fn()
    const onPromptStarted = vi.fn()
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:background'),
      client,
      onActivityChange,
      onPromptStarted,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    controlled.emit(userHistoryMessage('continue'))
    controlled.emit({
      type: 'assistant',
      uuid: 'assistant-background',
      message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    })
    controlled.emitResult()
    await sending

    expect(onPromptStarted).toHaveBeenCalledOnce()
    expect(onPromptStarted).toHaveBeenCalledWith('local:background')
    expect(onActivityChange).toHaveBeenNthCalledWith(1, 'local:background', 'processing')
    expect(onActivityChange).toHaveBeenNthCalledWith(2, 'local:background', 'success')
  })

  it('does not complete a draft when the query closes without an assistant response', async () => {
    const onPromptStarted = vi.fn()
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:no-response'),
      client,
      onPromptStarted,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    expect(onPromptStarted).not.toHaveBeenCalled()
  })

  it('accepts assistant output when a single-message query does not echo user history', async () => {
    const onActivityChange = vi.fn()
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:single-message'),
      client,
      onActivityChange,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    controlled.emit({
      type: 'assistant',
      uuid: 'assistant-uuid',
      session_id: 'claude-session',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'Done' }],
      },
    })
    controlled.emitResult()
    await sending

    expect(Object.values(store.getState().messages)).toMatchObject([
      { role: 'user', content: 'continue' },
      { role: 'assistant', content: 'Done' },
    ])
    expect(store.getState()).toMatchObject({
      prompt: '',
      runtimeError: null,
      runtimeStatus: 'ready',
    })
    expect(onActivityChange).toHaveBeenLastCalledWith('local:single-message', 'success')
  })

  it('accepts a successful result when a query emits no earlier response', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:result-only'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    controlled.emit({
      type: 'result',
      subtype: 'success',
      result: 'Done',
      session_id: 'claude-session',
    })
    await sending

    expect(Object.values(store.getState().messages)).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'user', content: 'continue' })]),
    )
    expect(store.getState()).toMatchObject({
      prompt: '',
      runtimeError: null,
      runtimeStatus: 'ready',
    })
  })

  it('recalls an ordinary optimistic message when the SDK reaches EOF before user history', async () => {
    const onActivityChange = vi.fn()
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:eof-before-user-history'),
      client,
      onActivityChange,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const didSend = store.getState().sendPrompt()
    controlled.finish()
    await didSend

    expect(Object.values(store.getState().messages)).toEqual([])
    expect(store.getState()).toMatchObject({
      prompt: 'continue',
      runtimeError: {
        kind: 'message-send',
        message: 'Claude did not write the message to conversation history',
      },
    })
    expect(onActivityChange).toHaveBeenLastCalledWith('local:eof-before-user-history', 'error')
  })

  it('shows a local slash command and its output in the conversation', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [{ name: 'prototype', description: 'Build a prototype' }],
      agents: [],
      models: [
        {
          value: 'glm-5.2',
          displayName: 'GLM 5.2',
          description: '',
          providerId: 'zhipu',
        },
      ],
    })
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:slash-command'), client })
    await store.getState().initialize()
    store.setState({
      runtimeStatus: 'error',
      runtimeError: { kind: 'message-send', message: 'previous query failed' },
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('/usage')

    const sending = store.getState().sendPrompt()

    expect(Object.values(store.getState().messages)).toMatchObject([
      { id: expect.stringMatching(/^local-user-/), role: 'user', content: '/usage' },
    ])
    expect(store.getState().prompt).toBe('')
    controlled.emit({
      type: 'system',
      subtype: 'local_command_output',
      content: 'Current usage: 10%',
      uuid: 'local-output-uuid',
      session_id: 'claude-session',
    })
    controlled.emitResult()
    await sending
    expect(Object.values(store.getState().messages).map((message) => message.content)).toEqual([
      '/usage',
      'Current usage: 10%',
    ])
    expect(store.getState()).toMatchObject({ runtimeError: null, runtimeStatus: 'ready' })
  })

  it('restores a stopped local slash command without interrupting the previous turn', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [{ name: 'prototype', description: 'Build a prototype' }],
      agents: [],
      models: [
        {
          value: 'glm-5.2',
          displayName: 'GLM 5.2',
          description: '',
          providerId: 'zhipu',
        },
      ],
    })
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:stop-slash-command'), client })
    await store.getState().initialize()
    store.getState().commitUserMessage({
      id: 'previous-user',
      role: 'user',
      content: 'previous prompt',
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('/usage')

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    expect(store.getState().messageIds).toEqual([
      'previous-user',
      expect.stringMatching(/^local-user-/),
    ])

    await store.getState().stopStreaming()
    await sending

    expect(store.getState().messageIds).toEqual(['previous-user'])
    expect(store.getState().prompt).toBe('/usage')
    expect(store.getState().interruptedTurnIds).not.toContain('previous-user')
  })

  it('keeps the optimistic user message recallable until the real user history event', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:recall-until-user'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    expect(Object.values(store.getState().messages)).toMatchObject([
      { id: expect.stringMatching(/^local-user-/), role: 'user', content: 'continue' },
    ])

    controlled.emit({ type: 'system', subtype: 'init', session_id: 'claude-session' })
    await vi.waitFor(() => expect(store.getState().claudeSessionId).toBe('claude-session'))
    await store.getState().stopStreaming()
    await sending

    expect(Object.values(store.getState().messages)).toEqual([])
    expect(store.getState().prompt).toBe('continue')
  })

  it.each([false, true])(
    'keeps sending on the resident stream after a first-turn recall (initialized: %s)',
    async (initialized) => {
      const persistence = createMemoryPersistence()
      const client = createClient()
      const controlled = createManualStream()
      client.openSessionStream.mockReturnValue(controlled.stream as never)
      const onBindClaudeSession = vi.fn()
      const store = trackedStore({
        ...createOptions('local:fresh-resend'),
        persistence,
        client,
        onBindClaudeSession,
      })
      store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
      store.getState().setPrompt('hello?')

      const firstSending = store.getState().sendPrompt()
      await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
      if (initialized) {
        controlled.emit({ type: 'system', subtype: 'init', session_id: 'first-session' })
        await vi.waitFor(() => expect(store.getState().claudeSessionId).toBe('first-session'))
      }
      await store.getState().stopStreaming()
      await firstSending

      client.loadSessionHistory.mockResolvedValue([
        {
          type: 'user',
          uuid: controlled.pushes[0]!.userMessageUuid,
          message: { role: 'user', content: 'hello?' },
        },
      ] as never)
      store.getState().setPrompt('hello again')
      const secondSending = store.getState().sendPrompt()
      await vi.waitFor(() => expect(controlled.pushes).toHaveLength(2))
      controlled.emitResult()
      await secondSending

      // The cancelled pair stays in the resident query's context; no transcript
      // surgery happens between turns — the next rebuild purges it instead.
      expect(client.openSessionStream).toHaveBeenCalledOnce()
      expect(client.rebuildSessionStream).not.toHaveBeenCalled()
      expect(client.dropTrailingTurn).not.toHaveBeenCalled()
      expect(controlled.pushes.map((push) => push.text)).toEqual(['hello?', 'hello again'])
      expect(
        onBindClaudeSession.mock.calls.every(([, id]) => id === 'first-session' || !initialized),
      ).toBe(true)
      expect(store.getState().claudeSessionId).toBe(initialized ? 'first-session' : null)
    },
  )

  it('sends the next prompt immediately after a recall without waiting for cleanup', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:wait-close'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('hello')
    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    await store.getState().stopStreaming()
    await sending
    expect(store.getState().prompt).toBe('hello')
    expect(Object.values(store.getState().messages)).toEqual([])

    store.getState().setPrompt('next')
    const resend = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    expect(controlled.pushes.map((push) => push.text)).toEqual(['hello', 'next'])
    expect(client.dropTrailingTurn).not.toHaveBeenCalled()
    controlled.emitResult()
    await resend
  })

  it('hides the dangling recalled turn and restores the prompt on reopen', async () => {
    const persistence = createMemoryPersistence()
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:reopen-recall'),
      claudeSessionId: 'claude-session',
      persistence,
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('hello777')

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    await store.getState().stopStreaming()
    await sending

    const recalledUuid = controlled.pushes[0]!.userMessageUuid
    expect(persistence.get('local:reopen-recall')?.composer.recalledFromMessage).toBe(recalledUuid)

    // The user cleared the restored draft again before reopening elsewhere.
    store.getState().setPrompt('')

    const restoredClient = createClient()
    restoredClient.loadSessionHistory.mockResolvedValue([
      {
        type: 'user',
        uuid: recalledUuid,
        timestamp: '2026-09-11T12:22:18.843Z',
        message: { role: 'user', content: 'hello777' },
      },
    ] as never)
    const restored = trackedStore({
      ...createOptions('local:reopen-recall'),
      claudeSessionId: 'claude-session',
      persistence,
      client: restoredClient,
    })
    await restored.getState().initialize()

    expect(
      Object.values(restored.getState().messages).map((message) => message.uuid),
    ).not.toContain(recalledUuid)
    expect(restored.getState().prompt).toBe('hello777')
  })

  it('does not treat the synthetic cleanup frame as a response while stopping', async () => {
    const client = createClient()
    const controlled = createManualStream({ finishOnInterrupt: false })
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:synthetic-stop-cleanup'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('hello777')

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    await store.getState().stopStreaming()
    controlled.emit({
      type: 'assistant',
      uuid: 'synthetic-cleanup-uuid',
      message: {
        role: 'assistant',
        model: '<synthetic>',
        content: [{ type: 'text', text: 'No response requested.' }],
      },
    })
    controlled.finish()
    await sending

    expect(store.getState().prompt).toBe('hello777')
    expect(Object.values(store.getState().messages)).toEqual([])
  })

  it('replaces the optimistic user message with the real history event', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [{ name: 'prototype', description: 'Build a prototype' }],
      agents: [],
      models: [
        {
          value: 'glm-5.2',
          displayName: 'GLM 5.2',
          description: '',
          providerId: 'zhipu',
        },
      ],
    })
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:reconcile-user'), client })
    await store.getState().initialize()
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('/prototype 在 docs/changes/mvp/protocol.html 生成原型')

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().messageIds).toHaveLength(1))
    const optimisticId = store.getState().messageIds[0]

    controlled.emit({
      type: 'user',
      uuid: 'persisted-user-uuid',
      timestamp: '2026-08-27T10:00:02.000Z',
      message: {
        role: 'user',
        content:
          '<command-message>prototype</command-message><command-name>/prototype</command-name><command-args>在 docs/changes/mvp/protocol.html 生成原型</command-args>',
      },
    })

    await vi.waitFor(() =>
      expect(
        Object.values(store.getState().messages).find(
          (message) => message.uuid === 'persisted-user-uuid',
        ),
      ).toBeDefined(),
    )
    const [persistedUser] = Object.values(store.getState().messages).filter(
      (message) => message.role === 'user',
    )
    expect(persistedUser).toMatchObject({
      uuid: 'persisted-user-uuid',
      commandName: 'prototype',
      timestamp: '2026-08-27T10:00:02.000Z',
    })
    expect(persistedUser?.id).not.toBe(optimisticId)
    expect(store.getState().sentTurnIds).toEqual(new Set([persistedUser!.id]))

    controlled.emitResult()
    await sending
  })

  it('ignores cancelled-turn assistant cleanup before the next user history event', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:cancel-cleanup'), client })
    store.getState().commitUserMessage({
      id: 'previous-user',
      role: 'user',
      content: 'Previous prompt',
    })
    store.getState().ingestLine(
      JSON.stringify({
        type: 'user',
        uuid: 'interrupt-uuid',
        message: { role: 'user', content: '[Request interrupted by user]' },
      }),
    )
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('Continue')

    const sending = store.getState().sendPrompt()
    controlled.emit({
      type: 'assistant',
      uuid: 'cleanup-uuid',
      message: { role: 'assistant', content: [{ type: 'text', text: 'SDK cleanup' }] },
    })
    controlled.emit({ type: 'system', subtype: 'init', session_id: 'claude-session' })
    await vi.waitFor(() => expect(store.getState().claudeSessionId).toBe('claude-session'))

    expect(
      Object.values(store.getState().messages).map((message) => message.content),
    ).not.toContain('SDK cleanup')

    controlled.emit({
      type: 'user',
      uuid: 'cleanup-tool-result-uuid',
      message: {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'cleanup-tool', content: 'Cleanup result' },
          { type: 'text', text: 'SDK cleanup note' },
        ],
      },
    })
    controlled.emit({
      type: 'assistant',
      uuid: 'cleanup-after-tool-result-uuid',
      message: { role: 'assistant', content: [{ type: 'text', text: 'More SDK cleanup' }] },
    })
    controlled.emit({
      type: 'user',
      uuid: 'current-user-uuid',
      message: { role: 'user', content: 'Continue' },
    })
    controlled.emit({
      type: 'assistant',
      uuid: 'current-assistant-uuid',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Current reply' }] },
    })
    controlled.emitResult()
    await sending

    expect(Object.values(store.getState().messages).map((message) => message.content)).toContain(
      'Current reply',
    )
    expect(
      Object.values(store.getState().messages).map((message) => message.content),
    ).not.toContain('SDK cleanup')
    expect(
      Object.values(store.getState().messages).map((message) => message.content),
    ).not.toContain('SDK cleanup note')
    expect(
      Object.values(store.getState().messages).map((message) => message.content),
    ).not.toContain('More SDK cleanup')
  })

  it('keeps local slash-command output after an interrupted turn', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:cancel-then-command'), client })
    store.getState().commitUserMessage({
      id: 'previous-user',
      role: 'user',
      content: 'Previous prompt',
    })
    store.getState().ingestLine(
      JSON.stringify({
        type: 'user',
        uuid: 'interrupt-uuid',
        message: { role: 'user', content: '[Request interrupted by user]' },
      }),
    )
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')

    const sending = store.getState().sendSlashCommand('usage')
    controlled.emit({
      type: 'system',
      subtype: 'local_command_output',
      content: 'Current usage: 10%',
    })
    controlled.emitResult()
    await sending

    expect(Object.values(store.getState().messages).map((message) => message.content)).toEqual([
      'Previous prompt',
      '[Request interrupted by user]',
      '/usage',
      'Current usage: 10%',
    ])
    expect(store.getState().runtimeError).toBeNull()
  })

  it('does not confirm a new prompt from a cancelled-turn cleanup result', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:cancel-cleanup-result'), client })
    store.getState().commitUserMessage({
      id: 'previous-user',
      role: 'user',
      content: 'Previous prompt',
    })
    store.getState().ingestLine(
      JSON.stringify({
        type: 'user',
        uuid: 'interrupt-uuid',
        message: { role: 'user', content: '[Request interrupted by user]' },
      }),
    )
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('Continue')

    const sending = store.getState().sendPrompt()
    controlled.emit({
      type: 'assistant',
      uuid: 'cleanup-uuid',
      message: { role: 'assistant', content: [{ type: 'text', text: 'SDK cleanup' }] },
    })
    controlled.emit({ type: 'result', subtype: 'success' })
    await sending

    expect(Object.values(store.getState().messages).map((message) => message.content)).toEqual([
      'Previous prompt',
      '[Request interrupted by user]',
    ])
    expect(store.getState().prompt).toBe('Continue')
  })

  it('confirms a UUID-matched response after an interrupted turn without user history echo', async () => {
    const client = createClient()
    const controlled = createManualStream({ finishOnInterrupt: false })
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:cancel-cleanup-matched'), client })
    store.getState().commitUserMessage({
      id: 'previous-user',
      role: 'user',
      content: 'Previous prompt',
    })
    store.getState().ingestLine(
      JSON.stringify({
        type: 'user',
        uuid: 'interrupt-uuid',
        message: { role: 'user', content: '[Request interrupted by user]' },
      }),
    )
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('Continue')

    const sending = store.getState().sendPrompt()
    const clientUserUuid = controlled.pushes[0]!.userMessageUuid
    controlled.emit({
      type: 'assistant',
      uuid: 'current-assistant-uuid',
      user_message_uuid: clientUserUuid,
      message: { role: 'assistant', content: [{ type: 'text', text: 'Current reply' }] },
    })
    controlled.emit({
      type: 'result',
      subtype: 'success',
      user_message_uuids: ['other-client-user-uuid', clientUserUuid],
    })
    await sending

    expect(Object.values(store.getState().messages).map((message) => message.content)).toContain(
      'Current reply',
    )
    expect(store.getState().runtimeError).toBeNull()
    expect(store.getState().prompt).toBe('')
  })

  it('measures live and stopped durations from the real user history timestamp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-27T10:00:00.000Z'))
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    // Fake timers must not capture the shared persistence singleton's
    // debounced flush — an abandoned fake timer would wedge every later
    // awaited update. Isolated memory persistence keeps the timer local.
    const store = trackedStore({
      ...createOptions('local:real-history-time'),
      persistence: createMemoryPersistence(),
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    vi.setSystemTime(new Date('2026-08-27T10:00:02.000Z'))
    controlled.emit({
      type: 'user',
      uuid: 'persisted-user-uuid',
      timestamp: '2026-08-27T10:00:02.000Z',
      message: { role: 'user', content: 'continue' },
    })
    await vi.advanceTimersByTimeAsync(0)

    vi.setSystemTime(new Date('2026-08-27T10:00:12.000Z'))
    await vi.advanceTimersByTimeAsync(200)
    expect(store.getState().streamingElapsed).toBe(0)

    controlled.emit({
      type: 'assistant',
      uuid: 'assistant-uuid',
      timestamp: '2026-08-27T10:00:12.000Z',
      message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'Working' }] },
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(store.getState().streamingElapsed).toBe(10)

    await store.getState().stopStreaming()
    await sending

    const persistedUser = Object.values(store.getState().messages).find(
      (message) => message.uuid === 'persisted-user-uuid',
    )
    expect(persistedUser?.timestamp).toBe('2026-08-27T10:00:02.000Z')
    expect(store.getState().interruptedTurnDurations[persistedUser!.id]).toBe(10)
  })

  it('continues an interrupted turn through a hidden synthetic nudge', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [],
      agents: [],
      models: [
        {
          value: 'glm-5.2',
          displayName: 'GLM 5.2',
          description: '',
          providerId: 'zhipu',
        },
      ],
    })
    client.loadSessionHistory.mockResolvedValue([
      {
        type: 'user',
        uuid: 'user-1',
        timestamp: '2026-09-11T12:20:00.000Z',
        message: { role: 'user', content: 'Write a poem' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        parentUuid: 'user-1',
        timestamp: '2026-09-11T12:20:05.000Z',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Roses are red' }] },
      },
      {
        type: 'user',
        uuid: 'interrupt-1',
        parentUuid: 'assistant-1',
        timestamp: '2026-09-11T12:20:06.000Z',
        message: { role: 'user', content: '[Request interrupted by user]' },
      },
    ] as never)
    const controlled = createManualStream({ finishOnInterrupt: false })
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:auto-continue'),
      claudeSessionId: 'claude-session',
      client,
    })
    await store.getState().initialize()
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')

    const resuming = store.getState().resumeInterrupted()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))

    expect(client.openSessionStream).toHaveBeenCalledWith(
      expect.objectContaining({ claudeSessionId: 'claude-session' }),
    )
    expect(controlled.pushes[0]).toMatchObject({
      text: 'resume',
      syntheticOrigin: 'auto-continuation',
    })
    expect(
      Object.values(store.getState().messages).filter(
        (message) => message.role === 'user' && !message.isInterruption,
      ),
    ).toHaveLength(1)

    // The synthetic echo never renders nor starts a turn; the continuation
    // lands after the terminated reply.
    controlled.emit({
      type: 'user',
      uuid: 'nudge-uuid',
      isMeta: true,
      message: {
        role: 'user',
        content:
          '[MESSAGE FROM NON-USER SOURCE - NOT USER INPUT]\n请从刚才中断的地方继续写完，不要重复已写过的内容。',
      },
    })
    controlled.emit({
      type: 'assistant',
      uuid: 'assistant-2',
      parentUuid: 'nudge-uuid',
      message: { role: 'assistant', content: [{ type: 'text', text: ', violets are blue' }] },
    })
    await vi.waitFor(() =>
      expect(
        Object.values(store.getState().messages).find((message) => message.uuid === 'assistant-2'),
      ).toBeDefined(),
    )

    controlled.emitResult()
    await resuming

    const contents = Object.values(store.getState().messages).map((message) => message.content)
    expect(contents).toContain(', violets are blue')
    expect(contents.some((content) => content.includes('NON-USER SOURCE'))).toBe(false)
    expect(store.getState().isStreaming).toBe(false)
  })

  it('recalls the persisted user turn when stopping after history but without a response', async () => {
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:stop-after-user'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    controlled.emit({
      type: 'user',
      uuid: 'persisted-user-uuid',
      message: { role: 'user', content: 'continue' },
    })
    await vi.waitFor(() =>
      expect(
        Object.values(store.getState().messages).find(
          (message) => message.uuid === 'persisted-user-uuid',
        ),
      ).toBeDefined(),
    )

    await store.getState().stopStreaming()
    await sending

    expect(Object.values(store.getState().messages)).toEqual([])
    expect(store.getState().prompt).toBe('continue')
    expect(store.getState().interruptedTurnIds).toEqual(new Set())
  })

  it('recalls when history confirmation arrives after Stop without a response', async () => {
    const client = createClient()
    const controlled = createManualStream({ finishOnInterrupt: false })
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:history-wins-recall-race'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    await store.getState().stopStreaming()

    // The history confirmation lands after Stop: the turn still ends in a
    // recall once the stream dies, never as a stopped turn with content.
    controlled.emit({
      type: 'user',
      uuid: 'persisted-user-uuid',
      message: { role: 'user', content: 'continue' },
    })
    controlled.finish()
    await sending

    expect(
      Object.values(store.getState().messages).filter((message) => message.role === 'user'),
    ).toEqual([])
    expect(store.getState().prompt).toBe('continue')
    expect(store.getState().interruptedTurnIds).toEqual(new Set())
  })

  it('recalls the optimistic message when a technical error happens before history', async () => {
    const client = createClient()
    client.openSessionStream.mockReturnValue(
      createFailingStream(new Error('model offline')).stream as never,
    )
    const store = trackedStore({ ...createOptions('local:prehistory-error'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    expect(Object.values(store.getState().messages)).toEqual([])
    expect(store.getState()).toMatchObject({
      prompt: 'continue',
      runtimeError: { kind: 'message-send', message: 'model offline' },
    })
  })

  it('attaches a technical error to the persisted user turn', async () => {
    const client = createClient()
    const error = new Error('model offline')
    const controlled = createStreamHarness({
      script: (_params, harness) => {
        harness.emit({
          type: 'user',
          uuid: 'persisted-user-uuid',
          message: { role: 'user', content: 'continue' },
        })
        harness.fail(error)
      },
    })
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({ ...createOptions('local:posthistory-error'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    const persistedUser = Object.values(store.getState().messages).find(
      (message) => message.uuid === 'persisted-user-uuid',
    )
    expect(
      Object.values(store.getState().messages).filter((message) => message.role === 'user'),
    ).toHaveLength(1)
    expect(store.getState().runtimeError).toBeNull()
    expect(store.getState()).toMatchObject({
      turnFailures: {
        [persistedUser!.id]: { message: 'model offline' },
      },
    })
  })

  it('reports awaiting user until every interactive request has a response', async () => {
    const onActivityChange = vi.fn()
    const client = createClient()
    const interactive = createManualStream()
    client.openSessionStream.mockReturnValue(interactive.stream as never)
    const store = trackedStore({
      ...createOptions('local:interactive'),
      client,
      onActivityChange,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    interactive.emit(userHistoryMessage('continue'))
    interactive.emitRequest({ kind: 'ask', toolUseId: 'ask-1', toolName: 'AskUserQuestion' })
    interactive.emitRequest({ kind: 'permission', toolUseId: 'permission-1', toolName: 'Write' })

    expect(onActivityChange).toHaveBeenLastCalledWith('local:interactive', 'awaiting-user')

    await store
      .getState()
      .respondToolRequest('ask-1', { behavior: 'allow', updatedInput: { answers: {} } })
    expect(onActivityChange).toHaveBeenLastCalledWith('local:interactive', 'awaiting-user')

    await store
      .getState()
      .respondToolRequest('permission-1', { behavior: 'deny', message: 'Not now' })
    expect(onActivityChange).toHaveBeenLastCalledWith('local:interactive', 'processing')

    interactive.emitResult()
    await sending
    expect(onActivityChange).toHaveBeenLastCalledWith('local:interactive', 'success')
  })

  it('keeps an interactive request pending when sending the response fails', async () => {
    const onActivityChange = vi.fn()
    const client = createClient()
    const interactive = createManualStream()
    vi.mocked(interactive.stream.respondToolRequest).mockRejectedValueOnce(
      new Error('RPC unavailable'),
    )
    client.openSessionStream.mockReturnValue(interactive.stream as never)
    const store = trackedStore({
      ...createOptions('local:interactive-response-failure'),
      client,
      onActivityChange,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    interactive.emitRequest({ kind: 'ask', toolUseId: 'ask-1', toolName: 'AskUserQuestion' })

    await expect(
      store
        .getState()
        .respondToolRequest('ask-1', { behavior: 'allow', updatedInput: { answers: {} } }),
    ).rejects.toThrow('RPC unavailable')

    expect(store.getState().pendingToolRequests).toHaveProperty('ask-1')
    expect(onActivityChange).toHaveBeenLastCalledWith(
      'local:interactive-response-failure',
      'awaiting-user',
    )

    interactive.emitResult()
    await sending
  })

  it('uses the history receive time when a user event has no timestamp', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-26T12:34:56.000Z'))
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:timestamp'),
      persistence: createMemoryPersistence(),
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    const userMessage = Object.values(store.getState().messages).find(
      (message) => message.role === 'user',
    )
    expect(userMessage?.timestamp).toBe('2026-07-26T12:34:56.000Z')
  })

  it('sends the selected provider and model through the stream options', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:proxy-model'),
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2/fast')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:proxy-model',
      options: expect.objectContaining({
        model: 'zhipu/glm-5.2/fast',
      }),
    })
  })

  it('passes context additional directories through to the stream options', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:additional-directories'),
      additionalDirectories: ['/Users/me/docs', '/Users/me/assets'],
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:additional-directories',
      options: expect.objectContaining({
        cwd: '/Users/me/project',
        additionalDirectories: ['/Users/me/docs', '/Users/me/assets'],
      }),
    })
  })

  it('omits additional directories from the stream options when none are configured', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:no-additional-directories'),
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:no-additional-directories',
      options: expect.not.objectContaining({ additionalDirectories: expect.anything() }),
    })
  })

  it('omits context additional directories in home mode', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:home-additional-directories'),
      isHomeMode: true,
      additionalDirectories: ['/Users/me/docs'],
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:home-additional-directories',
      options: expect.not.objectContaining({ additionalDirectories: expect.anything() }),
    })
  })

  it('captures the global permission mode at session creation and keeps it for the session', async () => {
    let defaultPermissionMode: ClaudePermissionMode = 'bypassPermissions'
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:session-scoped-permission'),
      persistence: createMemoryPersistence(),
      getDefaultPermissionMode: () => defaultPermissionMode,
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    expect(store.getState().permissionMode).toBe('bypassPermissions')

    // Later changes to the global default never touch the running session.
    defaultPermissionMode = 'default'
    store.getState().setPrompt('first')
    await store.getState().sendPrompt()

    defaultPermissionMode = 'acceptEdits'
    store.getState().setPrompt('second')
    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledOnce()
    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:session-scoped-permission',
      options: expect.objectContaining({ permissionMode: 'bypassPermissions' }),
    })
    expect(successful.pushes.map((push) => push.text)).toEqual(['first', 'second'])
    expect(successful.stream.setPermissionMode).not.toHaveBeenCalled()
    expect(store.getState().permissionMode).toBe('bypassPermissions')
  })

  it('applies an in-session permission change to the resident stream and persists it', async () => {
    const persistence = createMemoryPersistence()
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:in-session-permission'),
      persistence,
      getDefaultPermissionMode: () => 'default',
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPermissionMode('acceptEdits')
    store.getState().setPrompt('check this')
    await store.getState().sendPrompt()
    await persistence.flush()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:in-session-permission',
      options: expect.objectContaining({ permissionMode: 'acceptEdits' }),
    })
    expect(persistence.get('local:in-session-permission')?.composer.permissionMode).toBe(
      'acceptEdits',
    )
  })

  it('falls back to the app default when a stored session uses a retired permission mode', () => {
    const persistence = createMemoryPersistence()
    void persistence.update('local:legacy-permission', (record) => ({
      ...(record ?? {
        id: 'local:legacy-permission',
        composer: {
          prompt: '',
          selectedProviderId: null,
          selectedModelId: null,
          selectedAgent: null,
          permissionMode: 'dontAsk' as const,
        },
      }),
    }))
    const store = trackedStore({
      ...createOptions('local:legacy-permission'),
      persistence,
      getDefaultPermissionMode: () => 'plan',
      client: createClient(),
    })

    expect(store.getState().permissionMode).toBe('plan')
  })

  it('keeps Plan mode when the global permission mode changes', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:plan-permission'),
      persistence: createMemoryPersistence(),
      getDefaultPermissionMode: () => 'default',
      client,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPermissionMode('plan')
    store.getState().setPrompt('plan this change')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:plan-permission',
      options: expect.objectContaining({ permissionMode: 'plan' }),
    })
    expect(store.getState().permissionMode).toBe('plan')
  })

  it('switches the resident query model without rebuilding for same-class changes', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({ ...createOptions('local:model-switch'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('first')
    await store.getState().sendPrompt()

    store.getState().setSelectedProviderModel('zhipu', 'glm-5.3')
    store.getState().setPrompt('second')
    await store.getState().sendPrompt()

    expect(client.setSessionQueryModel).toHaveBeenCalledWith('local:model-switch', 'zhipu/glm-5.3')
    expect(client.openSessionStream).toHaveBeenCalledOnce()
    expect(client.rebuildSessionStream).not.toHaveBeenCalled()
    expect(successful.pushes.map((push) => push.text)).toEqual(['first', 'second'])
  })

  it('rebuilds the resident query when the model class changes', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    const rebuilt = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    client.rebuildSessionStream.mockReturnValue(rebuilt.stream as never)
    const store = trackedStore({ ...createOptions('local:model-class-switch'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('first')
    await store.getState().sendPrompt()

    store.getState().setSelectedProviderModel('claude', 'sonnet-4-6')
    store.getState().setPrompt('second')
    await store.getState().sendPrompt()

    expect(client.setSessionQueryModel).not.toHaveBeenCalled()
    expect(client.rebuildSessionStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'local:model-class-switch',
        reason: 'model-class',
        options: expect.objectContaining({ model: 'claude/sonnet-4-6' }),
      }),
    )
    expect(rebuilt.pushes[0]).toMatchObject({ text: 'second' })
  })

  it('rebuilds the resident query when the agent changes', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    const rebuilt = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    client.rebuildSessionStream.mockReturnValue(rebuilt.stream as never)
    const store = trackedStore({ ...createOptions('local:agent-switch'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('first')
    await store.getState().sendPrompt()

    store.getState().setSelectedAgent('reviewer')
    store.getState().setPrompt('second')
    await store.getState().sendPrompt()

    expect(client.rebuildSessionStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'local:agent-switch',
        reason: 'agent',
        options: expect.objectContaining({ agent: 'reviewer' }),
      }),
    )
  })

  it('hides dead pairs anywhere in the loaded transcript', async () => {
    const client = createClient()
    client.loadSessionHistory.mockResolvedValue([
      {
        type: 'user',
        uuid: 'user-1',
        message: { role: 'user', content: 'Prompt one' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-1',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Reply one' }] },
      },
      {
        type: 'user',
        uuid: 'dead-user',
        message: { role: 'user', content: 'Dead prompt' },
      },
      {
        type: 'user',
        uuid: 'dead-marker',
        message: { role: 'user', content: '[Request interrupted by user]' },
      },
      {
        type: 'user',
        uuid: 'user-2',
        message: { role: 'user', content: 'Prompt two' },
      },
      {
        type: 'assistant',
        uuid: 'assistant-2',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Reply two' }] },
      },
      {
        type: 'user',
        uuid: 'partial-user',
        message: { role: 'user', content: 'Partial prompt' },
      },
      {
        type: 'assistant',
        uuid: 'partial-assistant',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Partial reply' }] },
      },
      {
        type: 'user',
        uuid: 'partial-marker',
        message: { role: 'user', content: '[Request interrupted by user]' },
      },
    ] as never)
    const store = trackedStore({
      ...createOptions('local:dead-pairs'),
      claudeSessionId: 'claude-session',
      client,
    })

    await store.getState().initialize()

    // The interrupted turn that had streamed a partial reply stays visible —
    // including its interruption marker, which renders as a stopped-turn hint;
    // only the no-response pair is hidden.
    expect(Object.values(store.getState().messages).map((message) => message.content)).toEqual([
      'Prompt one',
      'Reply one',
      'Prompt two',
      'Reply two',
      'Partial prompt',
      'Partial reply',
      '[Request interrupted by user]',
    ])
  })

  it('marks background task turns in the activity state', async () => {
    const onActivityChange = vi.fn()
    const client = createClient()
    const controlled = createManualStream()
    client.openSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:background-turn'),
      client,
      onActivityChange,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('start the task')

    const sending = store.getState().sendPrompt()
    controlled.emit(userHistoryMessage('start the task'))
    controlled.emitResult()
    await sending
    onActivityChange.mockClear()

    // A finished background task auto-continues with no user send: frames
    // arrive while the send lifecycle is idle and only the activity moves.
    controlled.emit({
      type: 'assistant',
      uuid: 'background-assistant',
      message: { role: 'assistant', content: [{ type: 'text', text: 'Background work done' }] },
    })
    await vi.waitFor(() =>
      expect(onActivityChange).toHaveBeenLastCalledWith('local:background-turn', 'processing'),
    )
    expect(Object.values(store.getState().messages).map((message) => message.content)).toContain(
      'Background work done',
    )

    controlled.emitResult()
    await vi.waitFor(() =>
      expect(onActivityChange).toHaveBeenLastCalledWith('local:background-turn', 'success'),
    )
  })

  it('sends the configured fallback model when the session and project have no selection', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [],
      agents: [],
      models: [
        {
          value: 'model-a',
          displayName: 'Model A',
          description: '',
          providerId: 'first',
          providerName: 'First',
          contextWindow: 200_000,
        },
        {
          value: 'model-b',
          displayName: 'Model B',
          description: '',
          providerId: 'fallback',
          providerName: 'Fallback',
          contextWindow: 200_000,
        },
      ],
      modelMappings: { fallback: 'fallback/model-b' },
    } as never)
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:fallback-model'),
      client,
    })

    await store.getState().initialize()
    store.getState().setPrompt('continue')
    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:fallback-model',
      options: expect.objectContaining({
        model: 'fallback/model-b',
      }),
    })
  })

  it('uses the refreshed fallback model for the next send', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [],
      agents: [],
      models: [],
      modelMappings: {},
    })
    client.listProviders.mockResolvedValue([
      {
        id: 'first',
        name: 'First',
        baseURL: 'https://first.example.com',
        authToken: 'first-token',
        models: [
          {
            id: 'model-a',
            displayName: 'Model A',
            contextWindow: 200_000,
          },
        ],
      },
      {
        id: 'fallback',
        name: 'Fallback',
        baseURL: 'https://fallback.example.com',
        authToken: 'fallback-token',
        models: [
          {
            id: 'model-b',
            displayName: 'Model B',
            contextWindow: 200_000,
          },
        ],
      },
    ])
    client.listModelMappings.mockResolvedValue({ fallback: 'fallback/model-b' })
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:refreshed-fallback-model'),
      client,
    })

    await store.getState().initialize()
    await store.getState().refreshModels()
    store.getState().setPrompt('continue')
    await store.getState().sendPrompt()

    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:refreshed-fallback-model',
      options: expect.objectContaining({
        model: 'fallback/model-b',
      }),
    })
  })

  it('retries a model refresh and clears a session selection that no longer exists', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [],
      agents: [],
      models: [
        {
          value: 'removed-model',
          displayName: 'Removed model',
          description: '',
          providerId: 'removed-provider',
          providerName: 'Removed provider',
          contextWindow: 200_000,
        },
      ],
      modelMappings: {},
    })
    client.listProviders.mockRejectedValueOnce(new Error('RPC unavailable')).mockResolvedValue([
      {
        id: 'fallback',
        name: 'Fallback',
        baseURL: 'https://fallback.example.com',
        authToken: 'fallback-token',
        models: [
          {
            id: 'model-b',
            displayName: 'Model B',
            contextWindow: 200_000,
          },
        ],
      },
    ])
    client.listModelMappings.mockResolvedValue({ fallback: 'fallback/model-b' })
    const successful = createSuccessfulStream()
    client.openSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:removed-selection'),
      client,
    })

    await store.getState().initialize()
    store.getState().setSelectedProviderModel('removed-provider', 'removed-model')
    await store.getState().refreshModels()

    expect(client.listProviders).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({
      selectedProviderId: null,
      selectedModelId: null,
    })

    store.getState().setPrompt('continue')
    await store.getState().sendPrompt()
    expect(client.openSessionStream).toHaveBeenCalledWith({
      sessionId: 'local:removed-selection',
      options: expect.objectContaining({
        model: 'fallback/model-b',
      }),
    })
  })

  it('ignores an older model refresh that finishes after a newer refresh', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [],
      agents: [],
      models: [
        {
          value: 'selected-model',
          displayName: 'Selected model',
          description: '',
          providerId: 'selected-provider',
          providerName: 'Selected provider',
          contextWindow: 200_000,
        },
      ],
      modelMappings: {},
    })

    let resolveOlderProviders!: (providers: ModelProvider[]) => void
    const olderProviders = new Promise<ModelProvider[]>((resolve) => {
      resolveOlderProviders = resolve
    })
    const currentProviders: ModelProvider[] = [
      {
        id: 'selected-provider',
        name: 'Selected provider',
        baseURL: 'https://selected.example.com',
        authToken: 'selected-token',
        models: [
          {
            id: 'selected-model',
            displayName: 'Selected model',
            contextWindow: 200_000,
          },
        ],
      },
    ]
    client.listProviders.mockReturnValueOnce(olderProviders).mockResolvedValueOnce(currentProviders)
    client.listModelMappings.mockResolvedValue({})
    const store = trackedStore({
      ...createOptions('local:concurrent-model-refresh'),
      client,
    })

    await store.getState().initialize()
    store.getState().setSelectedProviderModel('selected-provider', 'selected-model')

    const olderRefresh = store.getState().refreshModels()
    const currentRefresh = store.getState().refreshModels()
    await currentRefresh

    resolveOlderProviders([
      {
        id: 'stale-provider',
        name: 'Stale provider',
        baseURL: 'https://stale.example.com',
        authToken: 'stale-token',
        models: [{ id: 'stale-model', displayName: 'Stale model', contextWindow: 200_000 }],
      },
    ])
    await olderRefresh

    expect(store.getState()).toMatchObject({
      availableModels: [expect.objectContaining({ value: 'selected-model' })],
      selectedProviderId: 'selected-provider',
      selectedModelId: 'selected-model',
    })
  })

  it('resends an edited historical message in the same session from its parent anchor', async () => {
    const client = createClient()
    client.loadSessionHistory.mockResolvedValue([
      {
        type: 'user',
        uuid: 'target-user-uuid',
        timestamp: '2026-07-11T07:00:00.000Z',
        message: { role: 'user', content: 'Original prompt' },
      },
      {
        type: 'assistant',
        uuid: 'old-assistant-uuid',
        timestamp: '2026-07-11T07:01:00.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Old branch reply' }],
        },
      },
    ] as never)
    const successful = createSuccessfulStream()
    client.rebuildSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:historical-edit'),
      claudeSessionId: 'same-session',
      client,
    })
    await store.getState().initialize()
    const userMessage = Object.values(store.getState().messages).find(
      (message) => message.uuid === 'target-user-uuid',
    )
    const { prepareMessageEdit } = store.getState()

    expect(prepareMessageEdit).toBeTypeOf('function')
    await expect(
      prepareMessageEdit?.({
        messageId: userMessage!.id,
        messageUuid: 'target-user-uuid',
        prompt: 'Edited prompt',
        providerId: 'zhipu',
        modelId: 'glm-5.2',
        permissionMode: 'bypassPermissions',
      }),
    ).resolves.toEqual({ status: 'sent' })

    expect(client.getSessionEditAnchor).toHaveBeenCalledWith({
      sessionId: 'same-session',
      projectId: 'project-1',
      messageId: 'target-user-uuid',
    })
    expect(client.rewindSessionFiles).toHaveBeenCalledWith({
      sessionId: 'same-session',
      projectId: 'project-1',
      userMessageId: 'target-user-uuid',
      dryRun: true,
    })
    // The rebuild owns the transcript surgery: the dropped tail travels with
    // the rebuild request instead of a separate renderer-side drop.
    expect(client.dropTrailingTurn).not.toHaveBeenCalled()
    expect(client.rebuildSessionStream).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'local:historical-edit',
        claudeSessionId: 'same-session',
        reason: 'edit',
        dropFromMessageUuid: 'target-user-uuid',
        projectId: 'project-1',
        options: expect.objectContaining({
          model: 'zhipu/glm-5.2',
          resumeSessionAt: 'parent-message-uuid',
        }),
      }),
    )
    expect(successful.pushes[0]).toMatchObject({ text: 'Edited prompt' })
    expect(
      Object.values(store.getState().messages).some(
        (message) => message.content === 'Old branch reply',
      ),
    ).toBe(false)
    expect(
      Object.values(store.getState().messages).some(
        (message) => message.content === 'Edited prompt',
      ),
    ).toBe(true)
  })

  it('restores the first-message edit as a draft when resend is cancelled without a response', async () => {
    const client = createClient()
    client.getSessionEditAnchor.mockResolvedValue({ strategy: 'fresh' })
    client.loadSessionHistory.mockResolvedValue([
      {
        type: 'user',
        uuid: 'first-user-uuid',
        message: { role: 'user', content: 'Original prompt' },
      },
      {
        type: 'assistant',
        uuid: 'old-assistant-uuid',
        message: { role: 'assistant', content: [{ type: 'text', text: 'Old reply' }] },
      },
    ] as never)
    const controlled = createManualStream()
    client.rebuildSessionStream.mockReturnValue(controlled.stream as never)
    const store = trackedStore({
      ...createOptions('local:first-edit-cancel'),
      claudeSessionId: 'source-session',
      client,
    })
    await store.getState().initialize()
    const first = Object.values(store.getState().messages).find(
      (message) => message.uuid === 'first-user-uuid',
    )

    const editing = store.getState().prepareMessageEdit({
      messageId: first!.id,
      messageUuid: 'first-user-uuid',
      prompt: 'Edited first prompt',
      providerId: 'zhipu',
      modelId: 'glm-5.2',
      permissionMode: 'bypassPermissions',
    })
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    await store.getState().stopStreaming()
    await expect(editing).resolves.toEqual({ status: 'sent' })

    expect(store.getState().claudeSessionId).toBe('source-session')
    expect(store.getState().prompt).toBe('Edited first prompt')
    expect(Object.values(store.getState().messages).map((message) => message.content)).toEqual([])
    expect(client.rebuildSessionStream).toHaveBeenCalledWith(
      expect.objectContaining({
        claudeSessionId: 'source-session',
        reason: 'edit',
        dropFromMessageUuid: 'first-user-uuid',
      }),
    )
  })

  it('waits for confirmation when historical file changes can be rewound', async () => {
    const client = createClient()
    client.loadSessionHistory.mockResolvedValue([
      {
        type: 'user',
        uuid: 'target-user-uuid',
        timestamp: '2026-07-11T07:00:00.000Z',
        message: { role: 'user', content: 'Original prompt' },
      },
    ] as never)
    client.rewindSessionFiles.mockResolvedValue({
      canRewind: true,
      filesChanged: ['src/app.tsx'],
      insertions: 3,
      deletions: 1,
    })
    const successful = createSuccessfulStream()
    client.rebuildSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:historical-confirm'),
      claudeSessionId: 'same-session',
      client,
    })
    await store.getState().initialize()
    const userMessage = Object.values(store.getState().messages).find(
      (message) => message.uuid === 'target-user-uuid',
    )
    const editState = store.getState()
    const draft = {
      messageId: userMessage!.id,
      messageUuid: 'target-user-uuid',
      prompt: 'Edited prompt',
      providerId: 'zhipu',
      modelId: 'glm-5.2',
      permissionMode: 'bypassPermissions' as const,
    }

    await expect(editState.prepareMessageEdit?.(draft)).resolves.toEqual({
      status: 'confirm',
      editTarget: {
        strategy: 'resume',
        resumeSessionAt: 'parent-message-uuid',
      },
      preview: {
        canRewind: true,
        filesChanged: ['src/app.tsx'],
        insertions: 3,
        deletions: 1,
      },
    })
    expect(client.rebuildSessionStream).not.toHaveBeenCalled()
    expect(store.getState().isMessageEditPending).toBe(true)

    await expect(
      store
        .getState()
        .submitMessageEdit(
          draft,
          { strategy: 'resume', resumeSessionAt: 'parent-message-uuid' },
          false,
        ),
    ).resolves.toBe(true)
    expect(store.getState().isMessageEditPending).toBe(false)
    expect(client.rewindSessionFiles).toHaveBeenCalledTimes(1)
    expect(client.rebuildSessionStream).toHaveBeenCalledWith(
      expect.objectContaining({
        claudeSessionId: 'same-session',
        options: expect.objectContaining({
          resumeSessionAt: 'parent-message-uuid',
        }),
      }),
    )
  })

  it('applies file rewind before resending when the user confirms revert', async () => {
    const client = createClient()
    const successful = createSuccessfulStream()
    client.rebuildSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:historical-revert'),
      claudeSessionId: 'same-session',
      client,
    })
    store.getState().commitUserMessage({
      id: 'user-local-id',
      uuid: 'target-user-uuid',
      role: 'user',
      content: 'Original prompt',
    })
    const { submitMessageEdit } = store.getState()

    expect(submitMessageEdit).toBeTypeOf('function')
    await expect(
      submitMessageEdit?.(
        {
          messageId: 'user-local-id',
          messageUuid: 'target-user-uuid',
          prompt: 'Edited prompt',
          providerId: 'zhipu',
          modelId: 'glm-5.2',
          permissionMode: 'bypassPermissions',
        },
        { strategy: 'resume', resumeSessionAt: 'parent-message-uuid' },
        true,
      ),
    ).resolves.toBe(true)
    expect(client.rewindSessionFiles).toHaveBeenLastCalledWith({
      sessionId: 'same-session',
      projectId: 'project-1',
      userMessageId: 'target-user-uuid',
      dryRun: false,
    })
    expect(client.rewindSessionFiles.mock.invocationCallOrder[0]).toBeLessThan(
      client.rebuildSessionStream.mock.invocationCallOrder[0]!,
    )
  })

  it('reports a checkpoint preview failure without sending the edit', async () => {
    const client = createClient()
    client.rewindSessionFiles.mockResolvedValue({
      canRewind: false,
      error: 'No file checkpoint found',
    })
    const store = trackedStore({
      ...createOptions('local:historical-error'),
      claudeSessionId: 'same-session',
      client,
    })
    store.getState().commitUserMessage({
      id: 'user-local-id',
      uuid: 'target-user-uuid',
      role: 'user',
      content: 'Original prompt',
    })
    const { prepareMessageEdit } = store.getState()

    await expect(
      prepareMessageEdit?.({
        messageId: 'user-local-id',
        messageUuid: 'target-user-uuid',
        prompt: 'Edited prompt',
        providerId: 'zhipu',
        modelId: 'glm-5.2',
        permissionMode: 'bypassPermissions',
      }),
    ).resolves.toEqual({ status: 'error' })
    expect(store.getState().runtimeError).toEqual({
      kind: 'message-edit',
      message: 'No file checkpoint found',
    })
    expect(client.rebuildSessionStream).not.toHaveBeenCalled()
  })

  it('does not rewind files when the historical message is no longer in the active UI branch', async () => {
    const client = createClient()
    const store = trackedStore({
      ...createOptions('local:stale-historical-edit'),
      claudeSessionId: 'same-session',
      client,
    })

    await expect(
      store.getState().submitMessageEdit(
        {
          messageId: 'missing-user-message',
          messageUuid: 'target-user-uuid',
          prompt: 'Edited prompt',
          providerId: 'zhipu',
          modelId: 'glm-5.2',
          permissionMode: 'bypassPermissions',
        },
        { strategy: 'resume', resumeSessionAt: 'parent-message-uuid' },
        true,
      ),
    ).resolves.toBe(false)

    expect(client.rewindSessionFiles).not.toHaveBeenCalled()
    expect(client.rebuildSessionStream).not.toHaveBeenCalled()
    expect(store.getState().runtimeError).toEqual({
      kind: 'message-edit',
      message: 'The historical message is no longer available',
    })
  })

  it('blocks the regular composer while a historical edit is preparing', async () => {
    let resolvePreview!: (result: ClaudeRewindFilesResult) => void
    const preview = new Promise<ClaudeRewindFilesResult>((resolve) => {
      resolvePreview = resolve
    })
    const client = createClient()
    client.rewindSessionFiles.mockImplementationOnce(async () => preview)
    const successful = createSuccessfulStream()
    client.rebuildSessionStream.mockReturnValue(successful.stream as never)
    const store = trackedStore({
      ...createOptions('local:historical-lock'),
      claudeSessionId: 'same-session',
      client,
    })
    await store.getState().initialize()
    store.getState().commitUserMessage({
      id: 'user-local-id',
      uuid: 'target-user-uuid',
      role: 'user',
      content: 'Original prompt',
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('Regular composer prompt')

    const preparing = store.getState().prepareMessageEdit({
      messageId: 'user-local-id',
      messageUuid: 'target-user-uuid',
      prompt: 'Edited historical prompt',
      providerId: 'zhipu',
      modelId: 'glm-5.2',
      permissionMode: 'bypassPermissions',
    })
    await vi.waitFor(() => expect(client.rewindSessionFiles).toHaveBeenCalledOnce())

    await store.getState().sendPrompt()
    expect(client.rebuildSessionStream).not.toHaveBeenCalled()
    expect(client.openSessionStream).not.toHaveBeenCalled()

    resolvePreview({
      canRewind: true,
      filesChanged: [],
      insertions: 0,
      deletions: 0,
    })
    await expect(preparing).resolves.toEqual({ status: 'sent' })
    expect(client.rebuildSessionStream).toHaveBeenCalledOnce()
    expect(successful.pushes[0]).toMatchObject({ text: 'Edited historical prompt' })
  })

  it('reports a failed historical query instead of returning a successful edit', async () => {
    const client = createClient()
    client.rebuildSessionStream.mockReturnValue(
      createFailingStream(new Error('model offline')).stream as never,
    )
    const store = trackedStore({
      ...createOptions('local:historical-query-error'),
      claudeSessionId: 'same-session',
      client,
    })
    store.getState().commitUserMessage({
      id: 'user-local-id',
      uuid: 'target-user-uuid',
      role: 'user',
      content: 'Original prompt',
    })

    await expect(
      store.getState().prepareMessageEdit({
        messageId: 'user-local-id',
        messageUuid: 'target-user-uuid',
        prompt: 'Edited prompt',
        providerId: 'zhipu',
        modelId: 'glm-5.2',
        permissionMode: 'bypassPermissions',
      }),
    ).resolves.toEqual({ status: 'error' })
    expect(store.getState().runtimeError).toEqual({
      kind: 'message-edit',
      message: 'model offline',
    })
    expect(Object.values(store.getState().messages).map((message) => message.content)).toEqual([])
  })

  it('does not start a query without a configured provider model', async () => {
    const client = createClient()
    const onModelConfigurationRequired = vi.fn()
    const store = trackedStore({
      ...createOptions('local:missing-model'),
      client,
      onModelConfigurationRequired,
    })
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()

    expect(client.openSessionStream).not.toHaveBeenCalled()
    expect(onModelConfigurationRequired).toHaveBeenCalledOnce()
    expect(store.getState().runtimeError).toBeNull()
  })

  it('retains authenticated Claude models when custom providers refresh', async () => {
    const client = createClient()
    client.startup.mockResolvedValue({
      cwd: '/Users/me/project',
      commands: [],
      agents: [],
      models: [
        {
          value: 'claude-sonnet-4-6',
          displayName: 'Sonnet 4.6',
          description: '',
          providerId: 'claude',
          providerName: 'Claude',
        },
      ],
      hasClaudeAuthentication: true,
      hasConfiguredProviders: false,
    })
    client.listProviders.mockResolvedValue([
      {
        id: 'zhipu',
        name: 'Zhipu GLM',
        baseURL: 'https://open.bigmodel.cn/api/anthropic',
        authToken: 'secret',
        models: [{ id: 'glm-5.2', displayName: 'GLM 5.2', contextWindow: 200_000 }],
      },
    ])
    const store = trackedStore({ ...createOptions('local:model-refresh'), client })

    await store.getState().initialize()
    await store.getState().refreshModels()

    expect(store.getState()).toMatchObject({
      hasClaudeAuthentication: true,
      hasConfiguredProviders: true,
      isModelAccessResolved: true,
      availableModels: [
        expect.objectContaining({ providerId: 'claude', value: 'claude-sonnet-4-6' }),
        expect.objectContaining({ providerId: 'zhipu', value: 'glm-5.2' }),
      ],
    })
  })

  it('keeps a completed failure unread when its runtime is disposed', async () => {
    const onActivityChange = vi.fn()
    const client = createClient()
    client.openSessionStream.mockReturnValue(
      createFailingStream(new Error('offline')).stream as never,
    )
    const store = trackedStore({
      ...createOptions('local:background'),
      client,
      onActivityChange,
    })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    await store.getState().sendPrompt()
    store.getState().dispose()

    expect(onActivityChange).toHaveBeenCalledWith('local:background', 'error')
    expect(onActivityChange).toHaveBeenLastCalledWith('local:background', 'error')
  })

  it('denies pending tool requests after the interrupt when stopping', async () => {
    const client = createClient()
    const interactive = createManualStream({ finishOnInterrupt: false })
    client.openSessionStream.mockReturnValue(interactive.stream as never)
    const store = trackedStore({ ...createOptions('local:stop-deny-order'), client })
    store.getState().setSelectedProviderModel('zhipu', 'glm-5.2')
    store.getState().setPrompt('continue')

    const sending = store.getState().sendPrompt()
    await vi.waitFor(() => expect(store.getState().isStreaming).toBe(true))
    interactive.emitRequest({ kind: 'permission', toolUseId: 'perm-1', toolName: 'Write' })
    expect(store.getState().pendingToolRequests).toHaveProperty('perm-1')

    const stopping = store.getState().stopStreaming()
    // The verified recipe: the interrupt lands before any deny response.
    expect(vi.mocked(interactive.stream.interrupt)).toHaveBeenCalledOnce()
    await stopping
    expect(vi.mocked(interactive.stream.respondToolRequest)).toHaveBeenCalledWith('perm-1', {
      behavior: 'deny',
      message: 'Interrupted',
    })
    expect(store.getState().pendingToolRequests).toEqual({})

    interactive.emitResult()
    await sending
  })
})
