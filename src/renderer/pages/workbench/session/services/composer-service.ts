import type { ClaudePermissionMode } from '../../../../services/claude/claude'
import { getLogger } from '../../../../services/logging'
import { useWorkbenchStore } from '../../stores/workbench-store'
import type { SessionController } from '../session-controller'
import {
  type SessionPreferences,
  createDefaultPreferences,
  saveSessionPreferences,
} from '../stores/session-preferences'
import type { AttachmentUpdate } from './attachments'

export class ComposerService {
  private readonly controller: SessionController
  private readonly logger = getLogger('persistence')

  constructor(controller: SessionController) {
    this.controller = controller
  }

  private persist(
    patch: Omit<Partial<SessionPreferences>, 'recalledFromMessage'> & {
      recalledFromMessage?: string | null
    },
  ) {
    const current = this.controller.composerStore.getState()
    const context = this.controller.contextStore.getState()
    // An ephemeral blank draft writes nothing to disk until it materializes
    // (content + navigate away, tab close, or first send).
    if (useWorkbenchStore.getState().sessions[context.sessionId]?.isUnsavedDraft) {
      return Promise.resolve()
    }
    const preferences: SessionPreferences = {
      prompt: patch.prompt ?? current.prompt,
      selectedProviderId:
        patch.selectedProviderId === undefined
          ? current.selectedProviderId
          : patch.selectedProviderId,
      selectedModelId:
        patch.selectedModelId === undefined ? current.selectedModelId : patch.selectedModelId,
      selectedAgent:
        patch.selectedAgent === undefined ? current.selectedAgent : patch.selectedAgent,
      permissionMode: patch.permissionMode ?? current.permissionMode,
      ...(patch.recalledFromMessage === null
        ? {}
        : patch.recalledFromMessage !== undefined
          ? { recalledFromMessage: patch.recalledFromMessage }
          : current.recalledFromMessage
            ? { recalledFromMessage: current.recalledFromMessage }
            : {}),
    }
    const attachments = patch.attachments ?? current.attachments
    if (attachments.length) preferences.attachments = attachments
    const write = saveSessionPreferences(
      context.sessionId,
      preferences,
      this.controller.persistenceService,
      context,
    )
    // Most callers fire and forget (one write per keystroke), so a failed
    // session-file write must never surface as an unhandled rejection.
    void write.catch((error: unknown) =>
      this.logger.error('composer.persist_failed', 'Failed to persist composer preferences', {
        error,
      }),
    )
    return write
  }

  snapshot(): SessionPreferences {
    const state = this.controller.composerStore.getState()
    const snapshot: SessionPreferences = {
      prompt: state.prompt,
      selectedProviderId: state.selectedProviderId,
      selectedModelId: state.selectedModelId,
      selectedAgent: state.selectedAgent,
      permissionMode: state.permissionMode,
      ...(state.recalledFromMessage ? { recalledFromMessage: state.recalledFromMessage } : {}),
    }
    if (state.attachments.length) snapshot.attachments = state.attachments
    return snapshot
  }

  setPrompt(prompt: string) {
    const store = this.controller.composerStore
    const didPromptChange = store.getState().prompt !== prompt
    store.getState().setPrompt(prompt)
    this.persist({ prompt })
    if (didPromptChange) {
      const { sessionId } = this.controller.contextStore.getState()
      this.controller.options.onPromptEdited?.(sessionId)
    }
  }

  setAttachments(update: AttachmentUpdate) {
    const store = this.controller.composerStore
    const attachments = typeof update === 'function' ? update(store.getState().attachments) : update
    store.setState({ attachments })
    this.persist({ attachments })
    const { sessionId } = this.controller.contextStore.getState()
    this.controller.options.onPromptEdited?.(sessionId)
  }

  restorePrompt(
    prompt: string,
    attachments = this.controller.composerStore.getState().attachments,
    recalledFromMessage?: string,
  ): Promise<void> {
    const currentMarker = this.controller.composerStore.getState().recalledFromMessage
    const marker = recalledFromMessage ?? currentMarker
    this.controller.composerStore.setState({
      prompt,
      attachments,
      ...(marker ? { recalledFromMessage: marker } : {}),
    })
    return this.persist({
      prompt,
      attachments,
      ...(marker ? { recalledFromMessage: marker } : { recalledFromMessage: null }),
    })
  }

  clearRecalledMessage() {
    this.controller.composerStore.setState({ recalledFromMessage: undefined })
    return this.persist({ recalledFromMessage: null })
  }

  markRecalledMessage(messageUuid: string) {
    this.controller.composerStore.setState({ recalledFromMessage: messageUuid })
    return this.persist({ recalledFromMessage: messageUuid })
  }

  setSelectedProviderModel(providerId: string, modelId: string) {
    this.controller.composerStore.getState().setSelectedProviderModel(providerId, modelId)
    this.persist({ selectedProviderId: providerId, selectedModelId: modelId })
    const { projectId } = this.controller.contextStore.getState()
    if (!projectId) return
    if (this.controller.options.onProjectDefaultModelChange) {
      this.controller.options.onProjectDefaultModelChange(projectId, providerId, modelId)
      return
    }
    void this.controller.claudeService
      .setProjectModel({ projectId, providerId, modelId })
      .catch(() => {})
  }

  clearSelectedProviderModel() {
    this.controller.composerStore.setState({
      selectedProviderId: null,
      selectedModelId: null,
    })
    this.persist({ selectedProviderId: null, selectedModelId: null })
  }

  setSelectedAgent(selectedAgent: string | null) {
    this.controller.composerStore.getState().setSelectedAgent(selectedAgent)
    this.persist({ selectedAgent })
  }

  setPermissionMode(permissionMode: ClaudePermissionMode) {
    this.controller.composerStore.getState().setPermissionMode(permissionMode)
    this.persist({ permissionMode })
    this.controller.sendService.setPermissionMode(permissionMode)
  }

  reset() {
    const preferences = createDefaultPreferences(this.controller.getDefaultPermissionMode)
    this.controller.composerStore.getState().reset(preferences)
    const context = this.controller.contextStore.getState()
    const write = saveSessionPreferences(
      context.sessionId,
      preferences,
      this.controller.persistenceService,
      context,
    )
    void write.catch((error: unknown) =>
      this.logger.error('composer.persist_failed', 'Failed to persist composer preferences', {
        error,
      }),
    )
  }
}
