import type { SessionController } from '../session-controller'
import type { SendSnapshot } from '../stores/send-lifecycle'
import { type ClaudeMessage, claudeJsonToMessage, isUserPromptMessage } from './message'

/** Persists and cleans up an input restored after cancelling an unanswered turn. */
export class RecalledInputService {
  private readonly controller: SessionController
  private cleanup: Promise<void> | null = null

  constructor(controller: SessionController) {
    this.controller = controller
  }

  setCleanup(cleanup: Promise<void> | null) {
    this.cleanup = cleanup
  }

  get hasCleanup() {
    return this.cleanup !== null
  }

  hasInput() {
    return this.controller.historyService.hasRecalledTail
  }

  async record(snapshot: SendSnapshot, restoreToComposer: boolean) {
    if (snapshot.isSynthetic) return
    this.controller.historyService.markRecalledTail(snapshot.userMessageUuid ?? null)
    if (restoreToComposer) {
      await this.controller.composerService.restorePrompt(
        snapshot.prompt,
        snapshot.attachments ?? [],
        snapshot.userMessageUuid,
      )
    } else if (snapshot.userMessageUuid) {
      await this.controller.composerService.markRecalledMessage(snapshot.userMessageUuid)
    }
  }

  async clear(): Promise<boolean> {
    await this.cleanup
    this.cleanup = null
    const context = this.controller.contextStore.getState()
    if (!context.claudeSessionId) return false
    this.controller.followService.stop()
    const entries = await this.controller.claudeService.loadSessionHistory(
      context.claudeSessionId,
      context.projectId ?? '',
    )
    const messages = entries
      .map((entry, index) => claudeJsonToMessage(entry, index))
      .filter((message): message is ClaudeMessage => Boolean(message))
    // Drop the exact message the recall was recorded for, so a turn another
    // client appended afterwards is never mistaken for the cancelled one. Only
    // a snapshot that captured no uuid (a very early cancellation) falls back
    // to the trailing prompt; the backend still refuses the drop when newer
    // conversation exists after the target.
    const recalledUuid = this.controller.historyService.recalledMessageUuid
    const lastUser = recalledUuid
      ? messages.findLastIndex((message) => message.uuid === recalledUuid)
      : messages.findLastIndex(
          (message) => isUserPromptMessage(message) && !message.parentToolUseId,
        )
    const user = messages[lastUser]
    if (
      !user?.uuid ||
      messages
        .slice(lastUser + 1)
        .some(
          (message) => message.role === 'assistant' && !message.isMeta && !message.parentToolUseId,
        )
    ) {
      this.controller.historyService.clearRecalledTail()
      await this.controller.composerService.clearRecalledMessage()
      return false
    }
    const result = await this.controller.claudeService.dropTrailingTurn({
      projectId: context.projectId ?? '',
      sessionId: context.claudeSessionId,
      userMessageUuid: user.uuid,
    })
    if (!result.dropped) throw new Error('Failed to remove the unanswered turn')
    this.controller.historyService.clearRecalledTail()
    await this.controller.composerService.clearRecalledMessage()
    if (result.removedSession) this.controller.historyService.markFreshSession()
    return result.removedSession
  }
}
