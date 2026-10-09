import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk'

import { toast } from '@/shadcn/toast'
import type { ClaudeAttachment, ClaudeOptions } from '@/shared/rpc'

import { appI18n } from '../../../../i18n/runtime'
import type {
  ClaudeContextUsageSnapshot,
  ClaudePermissionMode,
  ClaudeSessionEditAnchor,
  ClaudeSessionStream,
  ClaudeToolRequest,
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
  /** The session's resident query; owned by the main process, only consumed here. */
  private stream: ClaudeSessionStream | null = null
  /** True after a resident stream ended on its own; the next send rebuilds it. */
  private streamDied = false
  /** What the resident query was created (or last switched) to run with. */
  private streamModel: string | undefined
  private streamAgent: string | undefined
  /** A background task's auto-continued turn is running with no user send. */
  private backgroundTurnActive = false
  private turnEndWaiters: Array<() => void> = []
  private turnOutcome: SessionActivityEvent = 'idle'
  private turnPrompt = ''
  private turnRestoreToComposer = false
  private hasAssistantResponse = false
  private hasSampledContextUsage = false
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
   * Send the pending message queued behind the previous turn. The composer
   * draft is untouched — only the queued content goes out. A pending `/clear`
   * starts a new session and carries the current draft over, like a typed
   * `/clear` does. Returns false when nothing was sent (the pending message
   * stays queued for the user to edit or delete).
   */
  async sendPendingMessage() {
    const composer = this.controller.composerStore.getState()
    const pending = composer.pendingMessage
    if (!pending || this.isTurnBlocked()) return false
    const model = this.resolveTurnModel()
    if (!model) return false
    this.controller.composerService.deletePendingMessage()
    if (isClearPrompt(pending.prompt, pending.attachments)) {
      const draft = this.controller.composerService.snapshot()
      this.startNewSession({ prompt: draft.prompt, attachments: draft.attachments ?? [] })
      return true
    }

    return this.runPrompt({
      clearPrompt: false,
      model,
      permissionMode: composer.permissionMode,
      prompt: pending.prompt,
      attachments: pending.attachments,
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

  private baseStreamOptions(context: {
    isHomeMode: boolean
    projectPath: string | null
    additionalDirectories?: string[]
  }) {
    return {
      cwd: context.isHomeMode ? undefined : (context.projectPath ?? undefined),
      ...(!context.isHomeMode && context.additionalDirectories?.length
        ? { additionalDirectories: context.additionalDirectories }
        : {}),
    }
  }

  /** Attach the session's resident query, resuming the Claude session when its loaded history is real. */
  private ensureStream(
    model: string,
    permissionMode: ClaudePermissionMode,
    agent: string | undefined,
    editTarget?: ClaudeSessionEditAnchor,
  ): ClaudeSessionStream {
    const context = this.controller.contextStore.getState()
    const canResumeSession = this.controller.historyService.canResumeLoadedSession()
    const claudeSessionId =
      context.claudeSessionId && canResumeSession ? context.claudeSessionId : undefined
    const options: ClaudeOptions = {
      ...this.baseStreamOptions(context),
      ...(claudeSessionId ? {} : { sessionId: context.claudeSessionId ?? context.sessionId }),
      ...(editTarget?.strategy === 'resume' ? { resumeSessionAt: editTarget.resumeSessionAt } : {}),
      ...(agent ? { agent } : {}),
      model,
      permissionMode,
    }
    const stream = this.controller.claudeService.openSessionStream({
      sessionId: context.sessionId,
      ...(claudeSessionId ? { claudeSessionId } : {}),
      options,
    })
    this.adoptStream(stream, model, agent)
    return stream
  }

  /** Restart the resident query: stop it, run transcript surgery, and re-attach. */
  private rebuildStream(
    reason: 'edit' | 'model-class' | 'agent' | 'recovery',
    model: string,
    permissionMode: ClaudePermissionMode,
    agent: string | undefined,
    extra: { dropFromMessageUuid?: string; editTarget?: ClaudeSessionEditAnchor } = {},
  ): ClaudeSessionStream {
    const context = this.controller.contextStore.getState()
    const options: ClaudeOptions = {
      ...this.baseStreamOptions(context),
      ...(context.claudeSessionId ? {} : { sessionId: context.sessionId }),
      ...(extra.editTarget?.strategy === 'resume'
        ? { resumeSessionAt: extra.editTarget.resumeSessionAt }
        : {}),
      ...(agent ? { agent } : {}),
      model,
      permissionMode,
    }
    const stream = this.controller.claudeService.rebuildSessionStream({
      sessionId: context.sessionId,
      ...(context.claudeSessionId ? { claudeSessionId: context.claudeSessionId } : {}),
      options,
      reason,
      ...(extra.dropFromMessageUuid ? { dropFromMessageUuid: extra.dropFromMessageUuid } : {}),
      ...(context.projectId ? { projectId: context.projectId } : {}),
    })
    this.adoptStream(stream, model, agent)
    return stream
  }

  /**
   * Why the resident query cannot serve the next turn as-is. An agent switch
   * cannot be applied to a live query, and a claude ↔ proxy switch changes the
   * process env — both need a rebuild. A same-class model change switches the
   * live query instead.
   */
  private streamMismatch(model: string, agent: string | undefined): 'agent' | 'model-class' | null {
    if (agent !== this.streamAgent) return 'agent'
    const isClaudeModel = (qualified: string | undefined) => qualified?.startsWith('claude/')
    if (isClaudeModel(model) !== isClaudeModel(this.streamModel)) return 'model-class'
    return null
  }

  private seedToolRequest(request: ClaudeToolRequest) {
    const { sessionId } = this.controller.contextStore.getState()
    this.controller.runtimeStore.setState((current) => ({
      pendingToolRequests: {
        ...current.pendingToolRequests,
        [request.toolUseId]: request,
      },
    }))
    this.controller.options.onActivityChange?.(sessionId, 'awaiting-user')
  }

  private adoptStream(stream: ClaudeSessionStream, model: string, agent: string | undefined) {
    this.detachStream()
    this.stream = stream
    this.streamModel = model
    this.streamAgent = agent
    this.streamDied = false
    this.stopToolSubscription = stream.subscribeToolRequests((request) => {
      this.seedToolRequest(request)
    })
    // Requests that were already pending when attaching still owe an answer;
    // their cards are restored instead of hanging invisibly.
    for (const request of stream.getState().pendingToolRequests) {
      this.seedToolRequest(request)
    }
    this.runStreamLoop(stream)
  }

  private detachStream() {
    this.stopToolSubscription?.()
    this.stopToolSubscription = null
    this.stream?.detach()
    this.stream = null
  }

  private runStreamLoop(stream: ClaudeSessionStream) {
    void (async () => {
      try {
        for await (const message of stream) {
          this.handleStreamFrame(message)
        }
        this.handleStreamDeath(stream, null)
      } catch (caught) {
        this.handleStreamDeath(stream, caught)
      }
    })()
  }

  private handleStreamFrame(message: SDKMessage) {
    if (this.sendLifecycle.phase === 'idle') this.trackBackgroundTurn(message)
    if (!this.hasSampledContextUsage) {
      // The first streamed message proves the CLI transport is live; sample
      // the real context usage (reflects the history as of the previous
      // turn). Fire-and-forget — must not delay the send.
      this.hasSampledContextUsage = true
      void this.fetchContextUsage()
    }
    if (message.type === 'conversation_reset') {
      // /clear and fresh-session flows: the SDK resets its running usage
      // total, so the local counters and snapshot start over as well.
      this.controller.usageStore.setState(initialUsageState())
    }
    if (message.type === 'result' && message.usage) {
      this.controller.usageStore.setState((current) => recordResultUsage(current, message.usage))
      // Refresh the snapshot with the turn's final usage — this is where
      // compaction drops become visible. Fire-and-forget; the query stays
      // resident while the stream keeps flowing.
      void this.fetchContextUsage()
    }
    if (this.turnStream.processLine(JSON.stringify(message)) && !this.hasAssistantResponse) {
      this.hasAssistantResponse = true
      // The first agent content proves the transcript is real: complete
      // the draft now. Waiting for a fully successful turn would leave a
      // stopped or errored first turn stuck as a draft forever.
      const { sessionId } = this.controller.contextStore.getState()
      this.controller.options.onPromptStarted?.(sessionId)
    }
    // A result frame ends the current turn — never the resident stream.
    if (message.type === 'result') void this.finishTurn(null)
  }

  /**
   * A finished background task auto-continues as a turn with no user send:
   * the lifecycle stays idle, so the activity state alone tracks it — the
   * session shows as processing while it runs and settles on the result.
   */
  private trackBackgroundTurn(message: SDKMessage) {
    const isTurnFrame =
      message.type === 'user' || message.type === 'assistant' || message.type === 'stream_event'
    if (isTurnFrame && !this.backgroundTurnActive) {
      this.backgroundTurnActive = true
      const { sessionId } = this.controller.contextStore.getState()
      this.controller.options.onActivityChange?.(sessionId, 'processing')
      return
    }
    if (message.type === 'result' && this.backgroundTurnActive) {
      this.backgroundTurnActive = false
      const { sessionId } = this.controller.contextStore.getState()
      const outcome = message.subtype === 'success' ? 'success' : 'error'
      this.controller.options.onActivityChange?.(sessionId, outcome)
    }
  }

  private handleStreamDeath(stream: ClaudeSessionStream, error: unknown) {
    // A replaced stream (edit/model rebuild) ends by design; only an
    // unexpected end of the current stream marks the session for recovery.
    if (this.stream !== stream) return
    this.stream = null
    this.streamDied = true
    this.stopToolSubscription?.()
    this.stopToolSubscription = null
    if (this.sendLifecycle.phase !== 'idle') {
      // A clean end while a turn runs behaves like the old per-send EOF: the
      // lifecycle decides whether it was a recall, a completion, or a failure.
      void this.finishTurn(error ?? null)
    }
  }

  private waitForTurnEnd(): Promise<void> {
    return new Promise((resolve) => {
      this.turnEndWaiters.push(resolve)
    })
  }

  private async finishTurn(error: unknown) {
    const turnActive = this.sendLifecycle.phase !== 'idle'
    if (!turnActive) {
      // Background-task turns carry no user send; frames were ingested, the
      // lifecycle has nothing to finish.
      for (const resolve of this.turnEndWaiters.splice(0)) resolve()
      return
    }
    const isUserCancel = isSendCancellationRequested(this.sendLifecycle)
    const queryFailure =
      error === null || isUserCancel
        ? null
        : error instanceof Error
          ? error.message
          : 'Failed to execute Claude'
    if (queryFailure) {
      this.logger.error('query.stream_failed', 'The Claude turn failed', {
        context: { phase: this.sendLifecycle.phase },
        error: error instanceof Error ? error : new Error(queryFailure),
      })
    }
    const terminalEffect = this.transition({
      type: 'finished',
      result: queryFailure ? 'error' : 'success',
      message: queryFailure ?? undefined,
      finishedAt: Date.now(),
    })
    this.turnStream.stop()
    let outcome: SessionActivityEvent = 'success'
    if (terminalEffect?.kind !== 'history-confirmed') {
      outcome = terminalEffect?.activity ?? outcome
    }
    const { sessionId } = this.controller.contextStore.getState()
    if (!this.controller.isDisposed) {
      if (!queryFailure && outcome === 'success' && this.hasAssistantResponse) {
        const session = useWorkbenchStore.getState().sessions[sessionId]
        if (session?.title === DEFAULT_SESSION_TITLE && !session.custom_title) {
          // A placeholder until the next catalog refresh brings the SDK title;
          // the transcript must stay free of clotho-written custom-title records.
          const title = draftTitleFromPrompt(this.turnPrompt)
          if (title) useWorkbenchStore.getState().setLocalTitle(sessionId, title)
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
        // The cancelled pair stays in the transcript: the resident query's
        // context cannot be edited mid-flight, and the next rebuild purges it.
        // A failed record write must not block the state reset below.
        try {
          await this.recalledInput.record(terminalEffect.snapshot, this.turnRestoreToComposer)
        } catch (recordError) {
          this.logger.error('recall.record_failed', 'Failed to persist the recalled input', {
            error: recordError,
          })
        }
        if (
          !terminalEffect.snapshot.messages.some(
            (message) => isUserPromptMessage(message) || message.role === 'assistant',
          )
        ) {
          this.controller.options.onPromptRecalled?.(sessionId)
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
      this.controller.options.onActivityChange?.(sessionId, outcome)
      await this.controller.options.onRefreshCatalog?.()
    }
    this.turnOutcome = outcome
    for (const resolve of this.turnEndWaiters.splice(0)) resolve()
    if (
      !queryFailure &&
      outcome === 'success' &&
      this.controller.composerStore.getState().pendingMessage
    ) {
      this.schedulePendingMessageSend()
    }
  }

  /**
   * A fully successful turn auto-sends the queued pending message; stops,
   * failures, and recalls leave it queued for the user to edit or delete.
   * Deferred so the finished turn's send promise settles first and the queued
   * send goes through the controller's submit path cleanly.
   */
  private schedulePendingMessageSend() {
    setTimeout(() => {
      if (!this.controller.isDisposed) void this.controller.sendPendingMessage()
    }, 0)
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
  }: RunPromptInput): Promise<boolean> {
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

    // Acquire the resident query: reuse it for a plain follow-up, rebuild for
    // a historical edit, and rebuild after a query death so the transcript
    // surgery (dead-pair purge) runs before the session is resumed again.
    const agent = kind === 'auto-continue' ? undefined : (composer.selectedAgent ?? undefined)
    let dropFromMessageUuid: string | undefined
    let stream: ClaudeSessionStream
    if (replaceFromMessageId) {
      const targetMessage = recallMessages.find((message) => message.id === replaceFromMessageId)
      dropFromMessageUuid =
        targetMessage?.uuid ?? this.controller.runtimeStore.getState().messageEditDraft?.messageUuid
      if (!dropFromMessageUuid) throw new Error('The historical message is no longer available')
      stream = this.rebuildStream('edit', model, permissionMode, agent, {
        dropFromMessageUuid,
        editTarget,
      })
    } else if (this.stream) {
      const mismatch = this.streamMismatch(model, agent)
      if (mismatch) {
        stream = this.rebuildStream(mismatch, model, permissionMode, agent)
      } else if (model !== this.streamModel) {
        // Same class, different model: switch the live query. When the main
        // process cannot apply it, fall back to a rebuild.
        const switched = await this.controller.claudeService
          .setSessionQueryModel(this.controller.contextStore.getState().sessionId, model)
          .catch(() => null)
        if (switched?.applied) {
          this.streamModel = model
          stream = this.stream
        } else {
          stream = this.rebuildStream('model-class', model, permissionMode, agent)
        }
      } else {
        stream = this.stream
      }
    } else if (this.streamDied) {
      stream = this.rebuildStream('recovery', model, permissionMode, agent)
    } else {
      stream = this.ensureStream(model, permissionMode, agent)
    }

    if (historyPrefix) this.controller.historyService.reset(historyPrefix)

    const isAutoContinue = kind === 'auto-continue'
    const userMessageUuid = preparedUserMessage?.uuid ?? createUuid()
    if (!preparedUserMessage) {
      // Carrying the pushed uuid keeps the card editable in the live session:
      // the CLI never echoes the user line back, so without it no transcript
      // uuid arrives until the history is reloaded from disk.
      const userMessage: ClaudeMessage = {
        id: isAutoContinue ? `local-nudge-${Date.now()}` : `local-user-${Date.now()}`,
        role: 'user',
        content: prompt,
        ...(attachments.length ? { attachments } : {}),
        timestamp: new Date().toISOString(),
        uuid: userMessageUuid,
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
          userMessageUuid,
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

    this.hasAssistantResponse = false
    this.hasSampledContextUsage = false
    this.turnPrompt = prompt
    this.turnRestoreToComposer = clearPrompt || Boolean(historyPrefix)
    // Register the waiter before pushing: the turn's result frame can only
    // arrive afterwards, and the loop resolves it in finishTurn.
    const turnEnd = this.waitForTurnEnd()
    try {
      // This turn's live frames must flow: the recalled-tail guard only
      // shields the cancelled turn's stragglers, and record() re-arms it if
      // this turn is itself recalled.
      this.controller.historyService.clearRecalledTail()
      await stream.push({
        text: prompt,
        ...(attachments.length ? { attachments } : {}),
        userMessageUuid,
        ...(isAutoContinue ? { syntheticOrigin: 'auto-continuation' as const } : {}),
      })
      // A successful push proves an edit rebuild completed its transcript
      // surgery; retries no longer need to re-drop the same tail.
      if (dropFromMessageUuid && context.claudeSessionId) {
        this.controller.messageEditService.noteClearedTail(
          context.claudeSessionId,
          dropFromMessageUuid,
        )
      }
    } catch (caught) {
      // The stream loop may already have reported the death; finishTurn is a
      // no-op when no turn is active anymore.
      void this.finishTurn(caught)
    }
    await turnEnd
    return this.turnOutcome === 'success'
  }

  async stop() {
    this.transition({ type: 'stop-requested' })
    const stream = this.stream
    if (!stream) return
    // Verified stop recipe: interrupt first so the turn ends, then deny every
    // still-pending canUseTool (the CLI silently discards a too-late answer).
    // The turn's result frame drives the recall/stop effect afterwards.
    await stream.interrupt().catch((error: unknown) => {
      // The turn keeps running when the interrupt never lands; the log keeps
      // that divergence diagnosable instead of silently "stopped" in the UI.
      this.logger.error('query.interrupt_failed', 'Failed to interrupt the Claude turn', {
        error,
      })
    })
    const pending = Object.keys(this.controller.runtimeStore.getState().pendingToolRequests)
    await Promise.all(
      pending.map((toolUseId) =>
        this.respondToolRequest(toolUseId, {
          behavior: 'deny',
          message: 'Interrupted',
        }).catch(() => {}),
      ),
    )
  }

  /** True while the resident query is attached (including a pending attach). */
  hasResidentQuery() {
    return this.stream !== null
  }

  async respondToolRequest(toolUseId: string, result: ClaudeToolResult) {
    const runtimeStore = this.controller.runtimeStore
    const hasPendingRequest = Boolean(runtimeStore.getState().pendingToolRequests[toolUseId])
    await this.stream?.respondToolRequest(toolUseId, result)
    if (hasPendingRequest) {
      runtimeStore.setState((state) => {
        const pendingToolRequests = { ...state.pendingToolRequests }
        delete pendingToolRequests[toolUseId]
        return { pendingToolRequests }
      })
    }
    if (
      hasPendingRequest &&
      this.stream &&
      Object.keys(runtimeStore.getState().pendingToolRequests).length === 0
    ) {
      const { sessionId } = this.controller.contextStore.getState()
      this.controller.options.onActivityChange?.(sessionId, 'processing')
    }
  }

  setPermissionMode(permissionMode: ClaudePermissionMode) {
    if (this.stream) void this.stream.setPermissionMode(permissionMode)
  }

  /**
   * Sample the real context-window usage into the usage store: from the live
   * query while one exists, otherwise via the on-demand idle sampler (the
   * status entry between turns). Returns null when sampling failed; the
   * previous snapshot stays in every null case.
   */
  async fetchContextUsage(): Promise<ClaudeContextUsageSnapshot | null> {
    const stream = this.stream
    if (stream && stream.getState().status !== 'dead') {
      try {
        const snapshot = await stream.getContextUsage()
        if (snapshot) this.controller.usageStore.setState({ snapshot })
        return snapshot
      } catch {
        return null
      }
    }
    return this.controller.usageSampler.sample()
  }

  dispose() {
    this.stopToolSubscription?.()
    this.stopToolSubscription = null
    this.turnStream.stop()
    // The resident query keeps running in the main process after the consumer
    // walks away; recycling (idle/tab close) and session deletion decide when
    // it actually stops.
    const stream = this.stream
    this.stream = null
    stream?.detach()
    return Promise.resolve()
  }
}
