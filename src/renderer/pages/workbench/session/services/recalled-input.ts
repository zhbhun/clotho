import type { SessionController } from '../session-controller'
import type { SendSnapshot } from '../stores/send-lifecycle'

/**
 * Tracks an input restored after cancelling an unanswered turn. The cancelled
 * pair stays in the transcript — the resident query's context cannot be
 * edited mid-flight — so this is display bookkeeping only: the tail is hidden
 * until the next rebuild purges it from the JSONL.
 */
export class RecalledInputService {
  private readonly controller: SessionController

  constructor(controller: SessionController) {
    this.controller = controller
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
}
