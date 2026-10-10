import { computeTurns } from '../conversation/turns'
import type { SessionController } from '../session-controller'
import { backfillUsageFromHistory, initialUsageState } from '../stores/usage-store'
import { claudeJsonToMessage, isUserPromptMessage, parseClaudeLine } from './message'
import type { ClaudeJsonLine, ClaudeMessage } from './message'
import { StreamAssembler } from './message-stream'

const INTERRUPTION_MARKER_TEXTS = new Set([
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
])

function entryText(entry: ClaudeJsonLine): string {
  const content = entry.message?.content
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  return content
    .flatMap((part) =>
      part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string'
        ? [part.text]
        : [],
    )
    .join('\n')
    .trim()
}

function isRootUserPromptEntry(entry: ClaudeJsonLine): boolean {
  return (
    entry.type === 'user' &&
    entry.isMeta !== true &&
    entry.isSidechain !== true &&
    !INTERRUPTION_MARKER_TEXTS.has(entryText(entry))
  )
}

function isInterruptionMarkerEntry(entry: ClaudeJsonLine): boolean {
  return entry.type === 'user' && INTERRUPTION_MARKER_TEXTS.has(entryText(entry))
}

/**
 * Indexes of dead turns — a root user prompt whose run (up to the next root
 * user prompt) produced no real assistant reply and ends in an interruption
 * marker. The marker requirement keeps a merely unfinished run (another
 * client's live turn, a crashed query) visible until the rebuild's purge
 * settles it in the JSONL.
 */
export function deadTurnIndexes(entries: ReadonlyArray<ClaudeJsonLine>): Set<number> {
  const dead = new Set<number>()
  for (let index = 0; index < entries.length; index++) {
    if (!isRootUserPromptEntry(entries[index]!)) continue
    let end = index + 1
    let hasReply = false
    let hasMarker = false
    while (end < entries.length) {
      const next = entries[end]!
      if (isRootUserPromptEntry(next)) break
      if (isInterruptionMarkerEntry(next)) hasMarker = true
      if (
        next.type === 'assistant' &&
        (next.message as { model?: unknown } | undefined)?.model !== '<synthetic>'
      ) {
        hasReply = true
      }
      end++
    }
    if (hasMarker && !hasReply) for (let i = index; i < end; i++) dead.add(i)
    index = end - 1
  }
  return dead
}

export type HistoryIngestResult = {
  json?: ClaudeJsonLine
  rootUserHistory?: {
    message: ClaudeMessage
  }
  isAgentEvent: boolean
  isApiRetry: boolean
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
  /** Pending frame that will carry the batched stream notification. */
  private publishFrame: number | null = null
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

  /**
   * Coalesce the stream notification to one per frame: every stream_event
   * delta bumps the revision, and notifying React per delta floods the commit
   * cycle while the scroll/measure pipeline is also writing back — the
   * interleaved sync updates can exhaust React's nested update limit
   * ("Minified React error #185") and kill the turn. The frame callback runs
   * after that frame's scroll listeners, so each notification's cascade drains
   * before the next one lands.
   */
  private schedulePublish() {
    const revision = this.assembler.getRevision()
    if (revision === this.publishedRevision || this.publishFrame !== null) return
    this.publishFrame = requestAnimationFrame(() => {
      this.publishFrame = null
      if (this.controller.isDisposed) return
      this.publishedRevision = this.assembler.getRevision()
      this.controller.conversationStore.getState().replaceMessages(this.assembler.getAll())
    })
  }

  /**
   * Flush a pending batched notification now. The turn's end must land with
   * its terminal transition (failure card, stopped marker) instead of a frame
   * later.
   */
  flushPendingPublish() {
    if (this.publishFrame === null) return
    cancelAnimationFrame(this.publishFrame)
    this.publishFrame = null
    this.publishedRevision = this.assembler.getRevision()
    this.controller.conversationStore.getState().replaceMessages(this.assembler.getAll())
  }

  private publish() {
    // A synchronous publish (turn transitions, history reset) supersedes any
    // pending batched frame so message identity swaps stay ordered.
    if (this.publishFrame !== null) {
      cancelAnimationFrame(this.publishFrame)
      this.publishFrame = null
    }
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
    // Dead pairs — cancelled turns that never got a reply — stay in the JSONL
    // until the next rebuild purges them; loading hides them everywhere in the
    // transcript, not just at the tail, matching the purge predicate.
    const dead = deadTurnIndexes(history)
    const entries = dead.size ? history.filter((_, index) => !dead.has(index)) : history
    const mapped = entries
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is ClaudeMessage => Boolean(message))
    // Rebuild the cache-usage counters from the transcript so a reopened
    // session shows its historical average, not just turns sent this run.
    this.controller.usageStore.setState((current) => ({
      ...current,
      ...backfillUsageFromHistory(entries),
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
        return {
          json,
          isAgentEvent: false,
          isApiRetry: false,
          isLocalCommandResult: false,
          wasSuppressed: true,
        }
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

    // SDK-internal API retries surface as conversation cards; the wire event
    // carries no timestamp, so stamp the receive time for the countdown.
    const isApiRetry =
      json?.type === 'system' && (json.subtype === 'api_retry' || json.subtype === 'api_error')
    if (json && isApiRetry && !isTimestampValid(json.timestamp)) {
      json = { ...json, timestamp: new Date().toISOString() }
      messageLine = JSON.stringify(json)
    }

    // Synthetic frames (the auto-continuation nudge) replay as isMeta user
    // lines: never rendered, never confirming history for a pending send.
    if (json?.type === 'user' && json.isMeta === true) {
      return { json, isAgentEvent: false, isApiRetry, isLocalCommandResult: false }
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
          isApiRetry,
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
            isApiRetry,
            isLocalCommandResult,
          }
        }
      }
    }

    if (json && options.suppressUntilRootUserHistory && !isLocalCommandResult) {
      return {
        json,
        isAgentEvent: false,
        isApiRetry,
        isLocalCommandResult: false,
        wasSuppressed: true,
      }
    }

    if (json && this.isAnchorAssistantEntry(json)) this.lastAnchorAssistantUuid = json.uuid

    if (!this.assembler.processLine(messageLine)) {
      const parsed = parseClaudeLine(messageLine, Date.now())
      if (parsed) this.assembler.commit(parsed)
    }
    this.schedulePublish()
    return {
      json,
      isAgentEvent: Boolean(json && isAgentContentEvent(json)),
      isApiRetry,
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
    this.schedulePublish()
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
