import type { ClaudeSessionEditAnchor } from '../../../../services/claude/claude'
import type { SessionController } from '../session-controller'
import type { MessageEditDraft, MessageEditPreparation } from '../session-types'

type ActiveMessageEdit = {
  draft: Pick<MessageEditDraft, 'messageId' | 'messageUuid'>
  projectId: string
  sessionId: string
}

export class MessageEditService {
  private readonly controller: SessionController
  private activeEdit: ActiveMessageEdit | undefined
  private readonly clearedEditTails = new Set<string>()

  constructor(controller: SessionController) {
    this.controller = controller
  }

  private release() {
    this.activeEdit = undefined
    this.controller.runtimeStore.setState({ isMessageEditPending: false })
  }

  private begin(draft: MessageEditDraft) {
    const context = this.controller.contextStore.getState()
    const runtime = this.controller.runtimeStore.getState()
    const conversation = this.controller.conversationStore.getState()
    if (
      this.activeEdit ||
      runtime.isMessageEditPending ||
      runtime.isStreaming ||
      !context.claudeSessionId ||
      !context.projectId ||
      (conversation.messages[draft.messageId]?.uuid !== draft.messageUuid &&
        !this.clearedEditTails.has(`${context.claudeSessionId}:${draft.messageUuid}`))
    ) {
      return undefined
    }

    this.activeEdit = {
      draft: {
        messageId: draft.messageId,
        messageUuid: draft.messageUuid,
      },
      projectId: context.projectId,
      sessionId: context.claudeSessionId,
    }
    this.controller.runtimeStore.setState({ isMessageEditPending: true })
    return this.activeEdit
  }

  private isCurrent(operation: ActiveMessageEdit, draft: MessageEditDraft) {
    const context = this.controller.contextStore.getState()
    const runtime = this.controller.runtimeStore.getState()
    const conversation = this.controller.conversationStore.getState()
    return (
      this.activeEdit === operation &&
      runtime.isMessageEditPending &&
      context.claudeSessionId === operation.sessionId &&
      context.projectId === operation.projectId &&
      operation.draft.messageId === draft.messageId &&
      operation.draft.messageUuid === draft.messageUuid &&
      (conversation.messages[draft.messageId]?.uuid === draft.messageUuid ||
        this.clearedEditTails.has(`${context.claudeSessionId}:${draft.messageUuid}`))
    )
  }

  async prepare(draft: MessageEditDraft): Promise<MessageEditPreparation> {
    const context = this.controller.contextStore.getState()
    const runtime = this.controller.runtimeStore.getState()
    if (
      (!draft.prompt.trim() && !draft.attachments?.length) ||
      runtime.isStreaming ||
      context.isMockProject ||
      !context.claudeSessionId ||
      !context.projectId
    ) {
      return { status: 'error' }
    }
    const operation = this.begin(draft)
    if (!operation) {
      this.controller.runtimeStore.setState({
        runtimeError: {
          kind: 'message-edit',
          message: 'The historical message is no longer available',
        },
      })
      return { status: 'error' }
    }

    this.controller.runtimeStore.setState({ runtimeError: null })
    try {
      const anchor = await this.controller.claudeService.getSessionEditAnchor({
        sessionId: operation.sessionId,
        projectId: operation.projectId,
        messageId: draft.messageUuid,
      })
      if (!this.isCurrent(operation, draft)) {
        throw new Error('The historical edit is no longer active')
      }
      const preview = await this.controller.claudeService.rewindSessionFiles({
        sessionId: operation.sessionId,
        projectId: operation.projectId,
        userMessageId: draft.messageUuid,
        dryRun: true,
      })
      if (!this.isCurrent(operation, draft)) {
        throw new Error('The historical edit is no longer active')
      }
      if (!preview.canRewind) {
        throw new Error(preview.error || 'No file checkpoint is available for this message')
      }
      const hasFileChanges =
        Boolean(preview.filesChanged?.length) ||
        Boolean(preview.insertions) ||
        Boolean(preview.deletions)
      if (hasFileChanges) {
        return {
          status: 'confirm',
          editTarget: anchor,
          preview,
        }
      }

      const sent = await this.submit(draft, anchor, false)
      return { status: sent ? 'sent' : 'error' }
    } catch (caught) {
      this.release()
      this.controller.runtimeStore.setState({
        runtimeError: {
          kind: 'message-edit',
          message:
            caught instanceof Error ? caught.message : 'Failed to prepare the historical edit',
        },
      })
      return { status: 'error' }
    }
  }

  async submit(
    draft: MessageEditDraft,
    editTarget: ClaudeSessionEditAnchor,
    shouldRewindFiles: boolean,
  ) {
    const context = this.controller.contextStore.getState()
    const runtime = this.controller.runtimeStore.getState()
    if (
      (!draft.prompt.trim() && !draft.attachments?.length) ||
      runtime.isStreaming ||
      context.isMockProject ||
      !context.claudeSessionId ||
      !context.projectId
    ) {
      return false
    }
    const operation = this.activeEdit ?? this.begin(draft)
    if (!operation || !this.isCurrent(operation, draft)) {
      this.controller.runtimeStore.setState({
        runtimeError: {
          kind: 'message-edit',
          message: 'The historical message is no longer available',
        },
      })
      return false
    }

    this.controller.runtimeStore.setState({ runtimeError: null })
    try {
      // Rewind may replace or remove files selected for this edit. Capture their bytes first.
      const attachments =
        shouldRewindFiles && draft.attachments?.length
          ? (
              await this.controller.claudeService.prepareAttachments({
                attachments: draft.attachments,
              })
            ).attachments
          : draft.attachments
      if (!this.isCurrent(operation, draft)) {
        throw new Error('The historical edit is no longer active')
      }
      // The row editor unmounts while streaming; retain its retry draft in the session owner.
      this.controller.runtimeStore.setState({ messageEditDraft: { ...draft, attachments } })
      if (shouldRewindFiles) {
        const result = await this.controller.claudeService.rewindSessionFiles({
          sessionId: operation.sessionId,
          projectId: operation.projectId,
          userMessageId: draft.messageUuid,
          dryRun: false,
        })
        if (!this.isCurrent(operation, draft)) {
          throw new Error('The historical edit is no longer active')
        }
        if (!result.canRewind) {
          throw new Error(result.error || 'Failed to rewind session files')
        }
      }

      // A same-session edit replaces this message and every later turn. Remove
      // that transcript tail before resuming so the edited prompt is not added
      // after the old branch in Claude's context.
      if (editTarget.strategy === 'resume' || editTarget.strategy === 'fresh') {
        const tailKey = `${operation.sessionId}:${draft.messageUuid}`
        if (!this.clearedEditTails.has(tailKey)) {
          const result = await this.controller.claudeService.dropTrailingTurn({
            sessionId: operation.sessionId,
            projectId: operation.projectId,
            userMessageUuid: draft.messageUuid,
          })
          if (!result.dropped) {
            throw new Error('Failed to clear the historical message before resending')
          }
          if (result.removedSession) this.controller.historyService.markFreshSession()
          this.clearedEditTails.add(tailKey)
        }
        if (!this.isCurrent(operation, draft)) {
          throw new Error('The historical edit is no longer active')
        }
      }

      const sent = await this.controller.sendService.runPrompt({
        clearPrompt: false,
        model: `${draft.providerId}/${draft.modelId}`,
        permissionMode: draft.permissionMode,
        prompt: draft.prompt.trim(),
        attachments,
        replaceFromMessageId: draft.messageId,
        editTarget,
      })
      const runtimeError = this.controller.runtimeStore.getState().runtimeError
      // A user cancellation restores the edited prompt to the composer and is
      // a handled edit outcome, even though no assistant response was produced.
      if (!sent && !runtimeError) {
        this.controller.composerService.restorePrompt(draft.prompt, draft.attachments ?? [])
      }
      if (sent || !runtimeError) {
        this.controller.runtimeStore.setState({ messageEditDraft: null })
      }
      if (!sent && runtimeError) {
        this.controller.runtimeStore.setState({
          runtimeError: { ...runtimeError, kind: 'message-edit' },
        })
      }
      return sent || !runtimeError
    } catch (caught) {
      this.controller.runtimeStore.setState({
        runtimeError: {
          kind: 'message-edit',
          message: caught instanceof Error ? caught.message : 'Failed to send the historical edit',
        },
      })
      return false
    } finally {
      this.release()
    }
  }

  cancel() {
    this.release()
    this.controller.runtimeStore.setState({ messageEditDraft: null })
  }

  dispose() {
    this.activeEdit = undefined
  }
}
