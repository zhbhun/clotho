import { computeTurns } from '../conversation/turns'
import type { SessionController } from '../session-controller'
import { backfillUsageFromHistory, initialUsageState } from '../stores/usage-store'
import { claudeJsonToMessage, isUserPromptMessage, parseClaudeLine } from './message'
import type { ClaudeJsonLine, ClaudeMessage } from './message'
import { StreamAssembler } from './message-stream'

export type HistoryIngestResult = {
  json?: ClaudeJsonLine
  rootUserHistory?: {
    message: ClaudeMessage
  }
  isAgentEvent: boolean
  isLocalCommandResult: boolean
  wasSuppressed?: boolean
}

type IngestOptions = {
  shouldDeferRootUserHistory?: boolean
  suppressUntilRootUserHistory?: boolean
}

export function isTimestampValid(timestamp?: string): timestamp is string {
  return typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp))
}

export class HistoryService {
  private readonly controller: SessionController
  private readonly assembler = new StreamAssembler()
  /** Optimistic root turns may outlive the query until the follower replays their JSONL entries. */
  private optimisticUserMessageIds = new Set<string>()
  /** Avoid notifying React when a follower only replays an already-seen entry. */
  private publishedRevision = -1
  private isRecalledTail = false
  private recalledUuid: string | null = null
  get hasRecalledTail() {
    return this.recalledUuid !== null || this.isRecalledTail
  }
  /** Uuid of the recalled tail's user message, when the cancellation snapshot captured one. */
  get recalledMessageUuid() {
    return this.recalledUuid
  }
  clearRecalledTail() {
    this.recalledUuid = null
    this.isRecalledTail = false
  }
  private loadedSessionHasConversation: boolean | null = null
  /**
   * Uuid of the last transcript main-chain assistant entry seen (live or
   * loaded) — the anchor that decides whether the cached usage snapshot still
   * describes this conversation.
   */
  private lastAnchorAssistantUuid: string | null = null

  constructor(controller: SessionController) {
    this.controller = controller
  }

  messages() {
    return this.assembler.getAll()
  }

  get usageAnchorId() {
    return this.lastAnchorAssistantUuid
  }

  /** Same predicate family as the backend's finalizeChain filter, restricted to assistant entries. */
  private isAnchorAssistantEntry(entry: ClaudeJsonLine): entry is ClaudeJsonLine & {
    uuid: string
  } {
    return (
      entry.type === 'assistant' &&
      entry.isMeta !== true &&
      entry.isSidechain !== true &&
      typeof entry.uuid === 'string'
    )
  }

  private syncUsageAnchor(entries: ReadonlyArray<ClaudeJsonLine>) {
    this.lastAnchorAssistantUuid = null
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (this.isAnchorAssistantEntry(entry)) {
        this.lastAnchorAssistantUuid = entry.uuid
        break
      }
    }
  }

  private publish() {
    const revision = this.assembler.getRevision()
    if (revision === this.publishedRevision) return
    this.publishedRevision = revision
    this.controller.conversationStore.getState().replaceMessages(this.assembler.getAll())
  }

  reset(messages: ClaudeMessage[]) {
    this.assembler.reset(messages)
    this.optimisticUserMessageIds = new Set(
      messages
        .filter((message) => message.id.startsWith('local-user-') && isUserPromptMessage(message))
        .map((message) => message.id),
    )
    this.publish()
  }

  resetConversation() {
    this.assembler.reset([])
    this.optimisticUserMessageIds.clear()
    this.controller.conversationStore.getState().reset()
    this.controller.usageStore.setState(initialUsageState())
    this.lastAnchorAssistantUuid = null
    this.loadedSessionHasConversation = null
  }

  commitUserMessage(message: ClaudeMessage) {
    this.assembler.commit(message)
    if (message.id.startsWith('local-user-') && isUserPromptMessage(message)) {
      this.optimisticUserMessageIds.add(message.id)
    }
    this.publish()
    this.controller.conversationStore.getState().markSent(message.id)
  }

  replaceOptimisticMessage(optimisticMessageId: string, message: ClaudeMessage) {
    if (!this.assembler.replaceCommitted(optimisticMessageId, message)) return false
    this.optimisticUserMessageIds.delete(optimisticMessageId)
    this.controller.conversationStore.getState().replaceSentTurn(optimisticMessageId, message.id)
    this.publish()
    return true
  }

  private reconcileOptimisticUser(message: ClaudeMessage) {
    const optimistic = this.assembler
      .getAll()
      .find(
        (candidate) =>
          this.optimisticUserMessageIds.has(candidate.id) &&
          isUserPromptMessage(candidate) &&
          candidate.content === message.content,
      )
    return optimistic ? this.replaceOptimisticMessage(optimistic.id, message) : false
  }

  optimisticTimestamp(messageId: string) {
    return this.assembler.getAll().find((message) => message.id === messageId)?.timestamp
  }

  /** Prevent follower replay from rendering output from a recalled cancelled turn. */
  markRecalledTail(uuid: string | null = null) {
    this.recalledUuid = uuid
    this.isRecalledTail = true
  }

  canResumeLoadedSession() {
    return this.loadedSessionHasConversation !== false
  }

  markFreshSession() {
    this.loadedSessionHasConversation = false
  }

  async load() {
    const context = this.controller.contextStore.getState()
    if (!context.claudeSessionId) return
    const history = await this.controller.claudeService.loadSessionHistory(
      context.claudeSessionId,
      context.projectId ?? '',
    )
    if (this.controller.isDisposed) return
    // A deleted or otherwise stale Claude session can remain referenced by the
    // local session card after a recalled first turn is removed. Treat an empty
    // transcript as a fresh session so the next send does not resume that ID.
    const hasConversation = history.some(isRecoverableConversationEntry)
    this.syncUsageAnchor(history)
    const mapped = history
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is ClaudeMessage => Boolean(message))
    // Rebuild the cache-usage counters from the transcript so a reopened
    // session shows its historical average, not just turns sent this run.
    this.controller.usageStore.setState((current) => ({
      ...current,
      ...backfillUsageFromHistory(history),
    }))
    // Restore the cached usage snapshot only when the conversation still ends
    // at the assistant message it was sampled after — turns added by another
    // client invalidate it. The next live sample replaces the snapshot.
    const cachedUsage = this.controller.persistenceService.get(context.sessionId)?.contextUsage
    if (cachedUsage && cachedUsage.anchorMessageId === this.lastAnchorAssistantUuid) {
      this.controller.usageStore.setState((current) =>
        current.snapshot ? current : { ...current, snapshot: cachedUsage.snapshot },
      )
    }
    this.reset(this.applyRecalledInput(mapped))
    this.loadedSessionHasConversation = hasConversation
  }

  /**
   * A send that was cancelled before any response is recalled, not kept: reopen
   * hides the dangling user turn (still present in the JSONL until the next
   * send truncates it) and restores its prompt into the composer.
   */
  private applyRecalledInput(messages: ClaudeMessage[]): ClaudeMessage[] {
    const context = this.controller.contextStore.getState()
    const persistedUuid = this.controller.persistenceService.get(context.sessionId)?.composer
      .recalledFromMessage
    if (persistedUuid) {
      const index = messages.findLastIndex((message) => message.uuid === persistedUuid)
      const user = messages[index]
      const hasLaterRootUser = messages
        .slice(index + 1)
        .some((message) => isUserPromptMessage(message) && !message.parentToolUseId)
      const hasResponse = messages
        .slice(index + 1)
        .some((message) => message.role === 'assistant' && !message.isMeta)
      if (index < 0 || !user || !isUserPromptMessage(user) || hasLaterRootUser || hasResponse) {
        this.controller.composerService.clearRecalledMessage()
        return messages
      }
      this.markRecalledTail(persistedUuid)
      const input = this.controller.composerStore.getState()
      if (!input.prompt.trim() && !input.attachments.length) {
        this.controller.composerService.restorePrompt(
          user.content,
          user.attachments ?? [],
          persistedUuid,
        )
      }
      return messages.slice(0, index)
    }

    const lastTurn = computeTurns(messages).at(-1)
    const user = lastTurn?.userMessage
    if (!lastTurn?.isInterrupted || lastTurn.assistantMessages.length || !user?.uuid)
      return messages
    const index = messages.findLastIndex((message) => message.uuid === user.uuid)
    if (index < 0) return messages
    this.markRecalledTail(user.uuid)
    const input = this.controller.composerStore.getState()
    if (!input.prompt.trim() && !input.attachments.length) {
      this.controller.composerService.restorePrompt(user.content, user.attachments ?? [])
    }
    return messages.slice(0, index)
  }

  ingestLine(line: string, options: IngestOptions = {}): HistoryIngestResult {
    let messageLine = line
    let json: ClaudeJsonLine | undefined
    try {
      json = JSON.parse(line) as ClaudeJsonLine
      if (json.type === 'system' && json.subtype === 'init' && json.session_id) {
        this.loadedSessionHasConversation = true
        this.controller.contextStore.setState({ claudeSessionId: json.session_id })
        this.controller.runtimeStore.setState({ runtimeResume: json.session_id })
        const { sessionId } = this.controller.contextStore.getState()
        this.controller.options.onBindClaudeSession?.(sessionId, json.session_id)
      }
      if (json.type === 'system' && json.subtype === 'commands_changed' && json.commands) {
        this.controller.catalogStore.setState({ availableCommands: json.commands })
      }
    } catch {
      // Non-JSON stderr-like output is still rendered as a conversation message.
    }

    if (json && this.hasRecalledTail) {
      if (json.uuid === this.recalledUuid) this.isRecalledTail = true
      else if (json.type === 'user') {
        const message = claudeJsonToMessage(json)
        if (message && !message.isMeta && isUserPromptMessage(message) && !message.parentToolUseId)
          this.isRecalledTail = false
      }
      if (this.isRecalledTail)
        return { json, isAgentEvent: false, isLocalCommandResult: false, wasSuppressed: true }
    }

    const isLocalCommandResult =
      json?.type === 'system' &&
      (json.subtype === 'local_command_output' || json.subtype === 'local_command')
    if (json && isLocalCommandResult) {
      const receivedAt = Date.now()
      if (!isTimestampValid(json.timestamp)) {
        json = { ...json, timestamp: new Date(receivedAt).toISOString() }
        messageLine = JSON.stringify(json)
      }
    }

    // Synthetic frames (the auto-continuation nudge) replay as isMeta user
    // lines: never rendered, never confirming history for a pending send.
    if (json?.type === 'user' && json.isMeta === true) {
      return { json, isAgentEvent: false, isLocalCommandResult: false }
    }

    if (json?.type === 'user' && options.shouldDeferRootUserHistory) {
      const receivedAt = Date.now()
      const receivedTimestamp = new Date(receivedAt).toISOString()
      const sdkTimestamp = typeof json.timestamp === 'string' ? json.timestamp : undefined
      const didUseReceiveTime = !isTimestampValid(sdkTimestamp)
      const message = claudeJsonToMessage(
        didUseReceiveTime ? { ...json, timestamp: receivedTimestamp } : json,
        receivedAt,
      )
      const isRootUserHistory = Boolean(
        message && isUserPromptMessage(message) && !message.parentToolUseId,
      )
      if (message && isRootUserHistory) {
        return {
          json,
          rootUserHistory: { message },
          isAgentEvent: false,
          isLocalCommandResult,
        }
      }
    }

    if (json?.type === 'user' && !options.shouldDeferRootUserHistory) {
      const message = claudeJsonToMessage(json, Date.now())
      if (message && isUserPromptMessage(message) && !message.parentToolUseId) {
        if (this.reconcileOptimisticUser(message)) {
          return {
            json,
            isAgentEvent: false,
            isLocalCommandResult,
          }
        }
      }
    }

    if (json && options.suppressUntilRootUserHistory && !isLocalCommandResult) {
      return {
        json,
        isAgentEvent: false,
        isLocalCommandResult: false,
        wasSuppressed: true,
      }
    }

    if (json && this.isAnchorAssistantEntry(json)) this.lastAnchorAssistantUuid = json.uuid

    if (!this.assembler.processLine(messageLine)) {
      const parsed = parseClaudeLine(messageLine, Date.now())
      if (parsed) this.assembler.commit(parsed)
    }
    this.publish()
    return {
      json,
      isAgentEvent: Boolean(json && isAgentContentEvent(json)),
      isLocalCommandResult,
    }
  }

  ingestError(line: string) {
    const parsed = parseClaudeLine(line, Date.now())
    this.assembler.commit(
      parsed ?? {
        id: `error-${Date.now()}`,
        role: 'system',
        content: line,
        rawType: 'stderr',
      },
    )
    this.publish()
  }
}

/** Stream lifecycle envelopes do not prove that any reply content has arrived. */
function isAgentContentEvent(entry: ClaudeJsonLine): boolean {
  if (entry.type === 'assistant') {
    const message = claudeJsonToMessage(entry)
    return Boolean(message && !message.queryError && message.blocks?.length)
  }
  if (entry.type === 'result' && entry.subtype === 'success') return Boolean(entry.result?.trim())
  if (entry.type !== 'stream_event') return false
  const event = entry.event as
    | {
        type?: string
        content_block?: { type?: string; text?: string; thinking?: string }
        delta?: { text?: string; thinking?: string; partial_json?: string }
      }
    | undefined
  if (event?.type === 'content_block_start') {
    const block = event.content_block
    return block?.type === 'tool_use' || Boolean(block?.text?.trim() || block?.thinking?.trim())
  }
  if (event?.type === 'content_block_delta') {
    const delta = event.delta
    return Boolean(delta?.text?.trim() || delta?.thinking?.trim() || delta?.partial_json?.trim())
  }
  return false
}

function isRecoverableConversationEntry(entry: ClaudeJsonLine): boolean {
  if (entry.type === 'assistant') {
    return (entry.message as { model?: unknown } | undefined)?.model !== '<synthetic>'
  }
  if (entry.type !== 'user' || entry.isMeta === true) return false
  const content = entry.message?.content
  const text =
    typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content
            .filter((part) => part.type === 'text')
            .map((part) => part.text ?? '')
            .join('\n')
            .trim()
        : ''
  return Boolean(
    text &&
    !new Set(['[Request interrupted by user]', '[Request interrupted by user for tool use]']).has(
      text,
    ),
  )
}
