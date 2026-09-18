import { toast } from '@/shadcn/toast'
import type { ClaudeAttachment } from '@/shared/rpc'

import { appI18n } from '../../../../i18n/runtime'
import type {
  ClaudeContextUsageSnapshot,
  ClaudePermissionMode,
  ClaudeQuery,
  ClaudeSessionEditAnchor,
  ClaudeToolResult,
} from '../../../../services/claude/claude'
import { getLogger } from '../../../../services/logging'
import { materializeUnsavedDraft } from '../../services/session-records'
import { useWorkbenchStore } from '../../stores/workbench-store'
import type { SessionActivityEvent } from '../../stores/workbench-store'
import { DEFAULT_SESSION_TITLE } from '../../utils/session-list'
import { draftTitleFromPrompt } from '../draft-title'
import type { SessionController } from '../session-controller'
import type { SessionComposerDraft } from '../session-types'
import { findQualifiedModel, qualifiedSessionModel } from '../stores/model-selection'
import {
  createSendLifecycle,
  isSendCancellationRequested,
  transitionSendLifecycle,
} from '../stores/send-lifecycle'
import type { SendLifecycleEvent } from '../stores/send-lifecycle'
import { initialUsageState, recordResultUsage } from '../stores/usage-store'
import { type ClaudeMessage, isUserPromptMessage } from './message'
import { RecalledInputService } from './recalled-input'
import { TurnStreamService, latestTurnWasInterrupted } from './turn-stream'

type RunPromptInput = {
  clearPrompt: boolean
  model: string
  permissionMode: ClaudePermissionMode
  prompt: string
  attachments?: ClaudeAttachment[]
  replaceFromMessageId?: string
  editTarget?: ClaudeSessionEditAnchor
  /** `auto-continue` sends the hidden synthetic nudge that resumes an interrupted turn. */
  kind?: 'prompt' | 'auto-continue'
  /** The resumed turn's user message id (auto-continue only). */
  turnMessageId?: string
}

const AUTO_CONTINUATION_NUDGE = 'resume'

function createUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16)
    const value = character === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

function isClearPrompt(prompt: string, attachments: ClaudeAttachment[]) {
  return attachments.length === 0 && prompt.trim() === '/clear'
}

export class SendService {
  private readonly logger = getLogger('query')
  private readonly controller: SessionController
  private activeQuery: ClaudeQuery | null = null
  private recallQuery: (() => void) | null = null
  private recallApplied: Promise<void> | null = null
  private readonly recalledInput: RecalledInputService
  private readonly turnStream: TurnStreamService
  private sendLifecycle = createSendLifecycle()
  private stopToolSubscription: (() => void) | null = null

  constructor(controller: SessionController) {
    this.controller = controller
    this.recalledInput = new RecalledInputService(controller)
    this.turnStream = new TurnStreamService(
      controller,
      () => this.sendLifecycle,
      (event) => this.transition(event),
    )
  }

  private transition(event: SendLifecycleEvent) {
    const transition = transitionSendLifecycle(this.sendLifecycle, event)
    this.sendLifecycle = transition.state
    return transition.effect
  }

  ingestLine(line: string) {
    this.turnStream.processLine(line)
  }

  /** The catalog entry when the qualified model is explicitly marked as rejecting attachments. */
  private findMultimodalBlockedModel(model: string) {
    const entry = findQualifiedModel(
      this.controller.modelConfigurationStore.getState().availableModels,
      model,
    )
    return entry?.supportsMultimodal === false ? entry : undefined
  }

  /**
   * Resolve the qualified `<provider>/<model>` for a new turn, or null when the
   * turn is blocked (no usable selection — the caller is told to pick one).
   */
  private resolveTurnModel(): string | null {
    const context = this.controller.contextStore.getState()
    const composer = this.controller.composerStore.getState()
    const modelConfiguration = this.controller.modelConfigurationStore.getState()
    const model = qualifiedSessionModel({ ...context, ...composer, ...modelConfiguration })
    if (!model) {
      this.controller.options.onModelConfigurationRequired?.()
      return null
    }
    return model
  }

  private isTurnBlocked() {
    const context = this.controller.contextStore.getState()
    const runtime = this.controller.runtimeStore.getState()
    return (
      runtime.isStreaming ||
      runtime.isMessageEditPending ||
      context.isMockProject ||
      (!context.isHomeMode && !context.projectPath)
    )
  }

  async sendPrompt() {
    const composer = this.controller.composerStore.getState()
    const prompt = composer.prompt.trim()
    if ((!prompt && !composer.attachments.length) || this.isTurnBlocked()) return
    if (isClearPrompt(prompt, composer.attachments)) {
      this.startNewSession()
      return
    }
    const model = this.resolveTurnModel()
    if (!model) return

    await this.runPrompt({
      clearPrompt: true,
      model,
      permissionMode: composer.permissionMode,
      prompt,
      attachments: composer.attachments,
    })
  }

  /**
   * Continue the latest turn that was interrupted after content had streamed:
   * send the hidden synthetic auto-continuation nudge so the agent picks up
   * right after the terminated reply. Requires a response to exist — a turn
   * cancelled with no content is recalled instead, not resumed.
   */
  async resumeInterrupted() {
    if (this.isTurnBlocked()) return
    const context = this.controller.contextStore.getState()
    if (!context.claudeSessionId) return

    const messages = this.controller.historyService.messages()
    let turnMessage: ClaudeMessage | null = null
    let hasResponse = false
    for (let index = messages.length - 1; index >= 0; index--) {
      const message = messages[index]
      if (message.role === 'assistant' && !message.parentToolUseId) hasResponse = true
      if (isUserPromptMessage(message) && !message.parentToolUseId) {
        turnMessage = message
        break
      }
    }
    if (
      !turnMessage ||
      !hasResponse ||
      !latestTurnWasInterrupted(
        messages,
        this.controller.conversationStore.getState().interruptedTurnIds,
      )
    ) {
      return
    }

    const model = this.resolveTurnModel()
    if (!model) return
    const composer = this.controller.composerStore.getState()
    await this.runPrompt({
      kind: 'auto-continue',
      clearPrompt: false,
      model,
      permissionMode: composer.permissionMode,
      prompt: AUTO_CONTINUATION_NUDGE,
      turnMessageId: turnMessage.id,
    })
  }

  /** Run a slash command, keeping the composer draft intact when appropriate. */
  async sendSlashCommand(name: string) {
    const commandName = name.replace(/^\/+/, '').trim()
    if (!commandName || this.isTurnBlocked()) return
    if (commandName === 'clear') {
      const draft = this.controller.composerService.snapshot()
      this.startNewSession({
        prompt: draft.prompt,
        attachments: draft.attachments ?? [],
      })
      return
    }
    const composer = this.controller.composerStore.getState()
    const model = this.resolveTurnModel()
    if (!model) return

    await this.runPrompt({
      clearPrompt: false,
      model,
      permissionMode: composer.permissionMode,
      prompt: `/${commandName}`,
    })
  }

  private startNewSession(draft?: SessionComposerDraft) {
    this.controller.composerService.restorePrompt('', [])
    this.controller.options.onStartNewSession?.(draft)
  }

  async runPrompt({
    clearPrompt,
    model,
    permissionMode,
    prompt,
    attachments = [],
    replaceFromMessageId,
    editTarget,
    kind = 'prompt',
    turnMessageId,
  }: RunPromptInput) {
    const blockedModel = attachments.length ? this.findMultimodalBlockedModel(model) : undefined
    if (blockedModel) {
      toast.add({
        id: 'workbench-model-multimodal-unsupported',
        title: appI18n.t('workbench.error.sendFailed'),
        description: appI18n.t('workbench.error.modelMultimodalUnsupported', {
          name: blockedModel.displayName || blockedModel.value,
        }),
        type: 'error',
      })
      return false
    }
    const context = this.controller.contextStore.getState()
    const composer = this.controller.composerStore.getState()
    // An ephemeral blank draft becomes a persisted draft on its first send.
    if (useWorkbenchStore.getState().sessions[context.sessionId]?.isUnsavedDraft) {
      await materializeUnsavedDraft(
        context.sessionId,
        this.controller.composerService.snapshot(),
      ).catch((error: unknown) =>
        this.logger.error('session.draft_materialize_failed', 'Failed to save the draft session', {
          error,
        }),
      )
    }
    const recallMessages = this.controller.historyService.messages()
    // The session's own permission mode drives the query; new sessions start
    // from the app default, and in-turn changes stay scoped to this session.
    // Historical edits truncate the existing transcript and resend on the same Claude session ID.
    const hasRecallToPrepare = this.recalledInput.hasInput()
    let historyPrefix: ClaudeMessage[] | undefined
    if (replaceFromMessageId) {
      const targetIndex = recallMessages.findIndex((message) => message.id === replaceFromMessageId)
      if (
        targetIndex < 0 &&
        this.controller.runtimeStore.getState().messageEditDraft?.messageId !== replaceFromMessageId
      )
        throw new Error('The historical message is no longer available')
      historyPrefix = targetIndex < 0 ? recallMessages : recallMessages.slice(0, targetIndex)
    }

    // Show the new turn immediately while a recalled transcript is being
    // cleaned in the background. The generated UUID is passed to the SDK so
    // the eventual JSONL user line still matches the optimistic turn.
    let preparedUserMessage: ClaudeMessage | null = null
    if (hasRecallToPrepare) {
      preparedUserMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content: prompt,
        ...(attachments.length ? { attachments } : {}),
        timestamp: new Date().toISOString(),
        uuid: createUuid(),
      }
      this.transition({
        type: 'begin',
        snapshot: {
          messages: recallMessages,
          optimisticMessageId: preparedUserMessage.id,
          userMessageUuid: preparedUserMessage.uuid,
          prompt,
          attachments,
        },
      })
      this.controller.historyService.commitUserMessage(preparedUserMessage)
      if (clearPrompt) this.controller.composerService.restorePrompt('', [])
      this.controller.runtimeStore.setState({
        isSubmitting: false,
        isStreaming: true,
        streamingElapsed: 0,
        runtimeStatus: 'streaming',
        runtimeError: null,
      })
      this.controller.options.onActivityChange?.(context.sessionId, 'processing')
    }

    // A recalled trailing turn must leave the transcript before this send
    // resumes the session, otherwise it would re-enter the model context.
    let startFreshSession: boolean
    let query: ClaudeQuery
    try {
      startFreshSession = hasRecallToPrepare && (await this.recalledInput.clear())
      const canResumeSession =
        !startFreshSession && this.controller.historyService.canResumeLoadedSession()

      const queryOptions = {
        cwd: context.isHomeMode ? undefined : (context.projectPath ?? undefined),
        ...(!context.isHomeMode && context.additionalDirectories?.length
          ? { additionalDirectories: context.additionalDirectories }
          : {}),
        ...(context.claudeSessionId && !canResumeSession
          ? { sessionId: context.claudeSessionId }
          : !context.claudeSessionId
            ? { sessionId: context.sessionId }
            : {}),
        ...(context.claudeSessionId && canResumeSession ? { resume: context.claudeSessionId } : {}),
        ...(editTarget?.strategy === 'resume'
          ? { resumeSessionAt: editTarget.resumeSessionAt }
          : {}),
        agent: kind === 'auto-continue' ? undefined : (composer.selectedAgent ?? undefined),
        model,
        permissionMode,
      }
      query = this.controller.claudeService.query({
        prompt,
        options: queryOptions,
        ...(attachments.length ? { attachments } : {}),
        ...(preparedUserMessage?.uuid ? { userMessageUuid: preparedUserMessage.uuid } : {}),
        ...(kind === 'auto-continue' ? { syntheticOrigin: 'auto-continuation' as const } : {}),
      })
    } catch (caught) {
      if (preparedUserMessage) {
        this.controller.historyService.reset(recallMessages)
        this.controller.conversationStore.getState().removeSent(preparedUserMessage.id)
        if (clearPrompt) {
          this.controller.composerService.restorePrompt(prompt, attachments)
        }
        this.sendLifecycle = createSendLifecycle()
        this.controller.runtimeStore.setState({
          isSubmitting: false,
          isStreaming: false,
          streamingElapsed: 0,
          runtimeStatus: 'error',
          runtimeError: {
            kind: 'message-send',
            message: caught instanceof Error ? caught.message : 'Failed to execute Claude',
          },
        })
        this.controller.options.onActivityChange?.(context.sessionId, 'error')
      }

      throw caught
    }
    this.controller.followService.stop()
    // Reserve the ID before init so cancellation and catalog updates keep
    // referring to the same local card, including when its log is recreated.
    if (query.sessionId && (startFreshSession || !context.claudeSessionId)) {
      this.controller.historyService.markFreshSession()
      this.controller.contextStore.setState({ claudeSessionId: query.sessionId })
      this.controller.runtimeStore.setState({ runtimeResume: query.sessionId })
      this.controller.options.onBindClaudeSession?.(context.sessionId, query.sessionId)
      void this.controller.persistenceService
        .update(context.sessionId, (record) =>
          record ? { ...record, claudeSessionId: query.sessionId } : record,
        )
        .catch((error: unknown) =>
          this.logger.error(
            'send.binding_persist_failed',
            'Failed to persist the session binding',
            {
              error,
            },
          ),
        )
    }

    if (historyPrefix) this.controller.historyService.reset(historyPrefix)

    const isAutoContinue = kind === 'auto-continue'
    if (!preparedUserMessage) {
      const userMessage: ClaudeMessage = {
        id: isAutoContinue ? `local-nudge-${Date.now()}` : `local-user-${Date.now()}`,
        role: 'user',
        content: prompt,
        ...(attachments.length ? { attachments } : {}),
        timestamp: new Date().toISOString(),
      }
      this.transition({
        type: 'begin',
        snapshot: {
          // A same-session historical edit has already removed the old branch;
          // if it is recalled before any new response, restore only the prefix
          // before the edited message. The existing session keeps its identity
          // session history instead.
          messages: historyPrefix ?? recallMessages,
          optimisticMessageId: userMessage.id,
          userMessageUuid: query.userMessageUuid,
          prompt,
          attachments,
          ...(isAutoContinue ? { isSynthetic: true } : {}),
        },
        // The nudge continues a turn that already exists in history; it starts
        // confirmed and can only end stopped/failed/completed, never recalled.
        ...(isAutoContinue && turnMessageId
          ? { confirmed: { turnId: turnMessageId, startedAt: Date.now() } }
          : {}),
      })
      if (isAutoContinue && turnMessageId) {
        const conversationState = this.controller.conversationStore.getState()
        conversationState.clearStopped(turnMessageId)
        if (!conversationState.expandedTurns[turnMessageId]) {
          conversationState.toggleTurn(turnMessageId)
        }
      } else {
        this.controller.historyService.commitUserMessage(userMessage)
        if (clearPrompt) this.controller.composerService.restorePrompt('', [])
      }
      this.controller.runtimeStore.setState({
        isSubmitting: false,
        isStreaming: true,
        streamingElapsed: 0,
        runtimeStatus: 'streaming',
        runtimeError: null,
      })
      this.controller.options.onActivityChange?.(context.sessionId, 'processing')
    }

    this.activeQuery = query
    let resolveRecallApplied = () => {}
    this.recallApplied = new Promise<void>((resolve) => {
      resolveRecallApplied = resolve
    })
    const recalled = new Promise<null>((resolve) => {
      this.recallQuery = () => resolve(null)
    })
    this.stopToolSubscription = query.subscribeToolRequests((request) => {
      this.controller.runtimeStore.setState((current) => ({
        pendingToolRequests: {
          ...current.pendingToolRequests,
          [request.toolUseId]: request,
        },
      }))
      this.controller.options.onActivityChange?.(context.sessionId, 'awaiting-user')
    })

    let outcome: SessionActivityEvent = 'success'
    let hasAssistantResponse = false
    let hasSampledContextUsage = false
    let queryFailure: string | null = null
    try {
      const iterator = query[Symbol.asyncIterator]()
      while (true) {
        const next = await Promise.race([iterator.next(), recalled])
        if (!next || next.done || this.sendLifecycle.phase === 'recall-requested') break
        const message = next.value
        if (!hasSampledContextUsage) {
          // The first streamed message proves the CLI transport is live; sample
          // the real context usage (reflects the history as of the previous
          // turn). Fire-and-forget — must not delay the send.
          hasSampledContextUsage = true
          void this.fetchContextUsage()
        }
        if (message.type === 'conversation_reset') {
          // /clear and fresh-session flows: the SDK resets its running usage
          // total, so the local counters and snapshot start over as well.
          this.controller.usageStore.setState(initialUsageState())
        }
        if (message.type === 'result' && message.usage) {
          this.controller.usageStore.setState((current) =>
            recordResultUsage(current, message.usage),
          )
          // Refresh the snapshot with the turn's final usage — this is where
          // compaction drops become visible. Fire-and-forget; the query is
          // still alive while the stream is being consumed.
          void this.fetchContextUsage()
        }
        if (this.turnStream.processLine(JSON.stringify(message)) && !hasAssistantResponse) {
          hasAssistantResponse = true
          // The first agent content proves the transcript is real: complete
          // the draft now. Waiting for a fully successful turn would leave a
          // stopped or errored first turn stuck as a draft forever.
          this.controller.options.onPromptStarted?.(context.sessionId)
        }
      }
    } catch (caught) {
      const isUserCancel = isSendCancellationRequested(this.sendLifecycle)
      const message = caught instanceof Error ? caught.message : 'Failed to execute Claude'
      if (!isUserCancel) {
        this.logger.error('query.stream_failed', 'Claude query stream failed', {
          context: {
            phase: this.sendLifecycle.phase,
          },
          error: caught,
        })
      }
      queryFailure = message
      outcome = isUserCancel ? 'idle' : 'error'
      // Same-session historical edits clear the old branch before starting the
      // query. Restore the in-memory view on a failed query so the edit can be
      // retried with its captured draft; the transcript tail remains cleared.
    } finally {
      if (!this.recalledInput.hasCleanup) await Promise.resolve(query.close()).catch(() => {})
      const terminalEffect = this.transition({
        type: 'finished',
        result: queryFailure ? 'error' : 'success',
        message: queryFailure ?? undefined,
        finishedAt: Date.now(),
      })
      if (this.activeQuery === query) {
        this.activeQuery = null
        this.recallQuery = null
        this.recallApplied = null
      }
      this.stopToolSubscription?.()
      this.stopToolSubscription = null
      this.turnStream.stop()
      if (terminalEffect?.kind !== 'history-confirmed') {
        outcome = terminalEffect?.activity ?? outcome
      }
      if (!this.controller.isDisposed) {
        if (!queryFailure && outcome === 'success' && hasAssistantResponse) {
          const session = useWorkbenchStore.getState().sessions[context.sessionId]
          if (session?.title === DEFAULT_SESSION_TITLE && !session.custom_title) {
            // A placeholder until the next catalog refresh brings the SDK title;
            // the transcript must stay free of clotho-written custom-title records.
            const title = draftTitleFromPrompt(prompt)
            if (title) useWorkbenchStore.getState().setLocalTitle(context.sessionId, title)
          }
          // onPromptStarted already fired when the first agent content
          // streamed in; the draft is completed there, not here.
        }
        if (terminalEffect?.kind === 'recalled') {
          const recalledMessages = terminalEffect.snapshot.messages
          this.controller.historyService.reset(recalledMessages)
          if (terminalEffect.snapshot.optimisticMessageId) {
            this.controller.conversationStore
              .getState()
              .removeSent(terminalEffect.snapshot.optimisticMessageId)
          }
          // The user line still sits at the transcript tail; remember it so the
          // next send truncates it before resuming the session. A failed write
          // must not escape this finally block, otherwise the streaming-state
          // reset and the recallApplied resolution below are skipped and the
          // session stays blocked until reload.
          try {
            await this.recalledInput.record(
              terminalEffect.snapshot,
              clearPrompt || Boolean(historyPrefix),
            )
          } catch (error) {
            this.logger.error('recall.record_failed', 'Failed to persist the recalled input', {
              error,
            })
          }
          if (
            !terminalEffect.snapshot.messages.some(
              (message) => isUserPromptMessage(message) || message.role === 'assistant',
            )
          ) {
            this.controller.options.onPromptRecalled?.(context.sessionId)
          }
          this.controller.runtimeStore.setState({
            runtimeError: terminalEffect.error
              ? {
                  kind: 'message-send',
                  message: terminalEffect.error,
                }
              : null,
          })
        } else if (terminalEffect?.kind === 'stopped') {
          this.controller.conversationStore
            .getState()
            .markStopped(terminalEffect.turnId, terminalEffect.elapsed)
        } else if (terminalEffect?.kind === 'failed') {
          this.controller.runtimeStore.setState({ runtimeError: null })
          this.controller.conversationStore.getState().markFailed(terminalEffect.turnId, {
            elapsed: terminalEffect.elapsed,
            message: terminalEffect.message,
          })
        }
        const runtimeError = this.controller.runtimeStore.getState().runtimeError
        this.controller.runtimeStore.setState({
          isSubmitting: false,
          isStreaming: false,
          streamingElapsed: 0,
          runtimeStatus: runtimeError ? 'error' : 'ready',
          pendingToolRequests: {},
        })
        resolveRecallApplied()
        this.controller.options.onActivityChange?.(context.sessionId, outcome)
        await this.controller.options.onRefreshCatalog?.()
        this.controller.followService.sync()
      }
      resolveRecallApplied()
    }
    return outcome === 'success'
  }

  async stop() {
    const query = this.activeQuery
    if (!query) return
    this.transition({ type: 'stop-requested' })
    const recallApplied = this.recallApplied
    if (this.sendLifecycle.phase === 'recall-requested') {
      // Stop consuming immediately. Late SDK output cannot turn a recall into a stopped reply.
      // Closing the transport is the immediate cancellation boundary. Do not
      // make the next send wait for an interrupt acknowledgment that may never
      // arrive from a disconnected host.
      // Host close already aborts the query. A concurrent interrupt RPC can
      // arrive after close removed the stream and produce a spurious error.
      const cleanup = Promise.resolve(query.close())
      this.recalledInput.setCleanup(cleanup)
      // Cancellation stays immediate; the next send waits for host closure.
      void cleanup.catch(() => {})
      this.recallQuery?.()
      await recallApplied
      return
    }
    await query.interrupt().catch(() => {})
  }

  async respondToolRequest(toolUseId: string, result: ClaudeToolResult) {
    const runtimeStore = this.controller.runtimeStore
    const hasPendingRequest = Boolean(runtimeStore.getState().pendingToolRequests[toolUseId])
    await this.activeQuery?.respondToolRequest(toolUseId, result)
    if (hasPendingRequest) {
      runtimeStore.setState((state) => {
        const pendingToolRequests = { ...state.pendingToolRequests }
        delete pendingToolRequests[toolUseId]
        return { pendingToolRequests }
      })
    }
    if (
      hasPendingRequest &&
      this.activeQuery &&
      Object.keys(runtimeStore.getState().pendingToolRequests).length === 0
    ) {
      const { sessionId } = this.controller.contextStore.getState()
      this.controller.options.onActivityChange?.(sessionId, 'processing')
    }
  }

  setPermissionMode(permissionMode: ClaudePermissionMode) {
    if (this.activeQuery) void this.activeQuery.setPermissionMode(permissionMode)
  }

  /**
   * Sample the real context-window usage into the usage store: from the live
   * query while one exists, otherwise via the on-demand idle sampler (the
   * status entry between turns). Returns null when sampling failed; the
   * previous snapshot stays in every null case.
   */
  async fetchContextUsage(): Promise<ClaudeContextUsageSnapshot | null> {
    const query = this.activeQuery
    if (query) {
      try {
        const snapshot = await query.getContextUsage()
        if (snapshot) this.controller.usageStore.setState({ snapshot })
        return snapshot
      } catch {
        return null
      }
    }
    return this.controller.usageSampler.sample()
  }

  dispose() {
    const wasProcessing = this.activeQuery !== null
    this.stopToolSubscription?.()
    this.stopToolSubscription = null
    this.turnStream.stop()
    let interrupted: Promise<void> = Promise.resolve()
    if (this.activeQuery) {
      interrupted = Promise.resolve(this.activeQuery.interrupt()).catch(() => {})
      this.activeQuery.close()
      this.activeQuery = null
    }
    if (wasProcessing) {
      const { sessionId } = this.controller.contextStore.getState()
      this.controller.options.onActivityChange?.(sessionId, 'idle')
    }
    // Awaited by session deletion so the CLI cannot append to a transcript
    // after it has been deleted.
    return interrupted
  }
}
