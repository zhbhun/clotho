import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shadcn/alert-dialog'

import { AppAlertDialog, AppAlertDialogContent } from '../../../../components/app-dialog'
import type {
  ClaudeModelInfo,
  ClaudePermissionMode,
  ClaudeSessionEditAnchor,
  ClaudeSlashCommand,
} from '../../../../services/claude/claude'
import { PromptComposer } from '../prompt'
import type { ClaudeMessage } from '../services/message'
import type { MessageEditDraft, MessageEditPreparation } from '../session-types'

export type MessageEditConfig = {
  draft?: MessageEditDraft | null
  availableCommands: ClaudeSlashCommand[]
  modelOptions: ClaudeModelInfo[]
  permissionMode: ClaudePermissionMode
  projectPath?: string
  selectedModelId: string
  selectedProviderId: string
  onCancelPreparation: () => void
  onPrepare: (draft: MessageEditDraft) => Promise<MessageEditPreparation>
  onSelectFiles: (startingFolder?: string) => Promise<string[]>
  onSubmit: (
    draft: MessageEditDraft,
    editTarget: ClaudeSessionEditAnchor,
    rewindFiles: boolean,
  ) => Promise<boolean>
}

export function HistoricalMessageEditor({
  config,
  message,
  onCancel,
}: {
  config: MessageEditConfig
  message: ClaudeMessage
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const savedDraft =
    config.draft?.messageId === message.id && config.draft.messageUuid === message.uuid
      ? config.draft
      : undefined
  const [prompt, setPrompt] = useState(savedDraft?.prompt ?? message.content)
  const [attachments, setAttachments] = useState(
    savedDraft?.attachments ?? message.attachments ?? [],
  )
  const [providerId, setProviderId] = useState(savedDraft?.providerId ?? config.selectedProviderId)
  const [modelId, setModelId] = useState(savedDraft?.modelId ?? config.selectedModelId)
  const [permissionMode, setPermissionMode] = useState(
    savedDraft?.permissionMode ?? config.permissionMode,
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const interactionScope = useId()
  const [confirmation, setConfirmation] = useState<
    Extract<MessageEditPreparation, { status: 'confirm' }> | undefined
  >()
  const selectedModel =
    config.modelOptions.find(
      (option) => option.providerId === providerId && option.value === modelId,
    ) ?? config.modelOptions[0]
  const selectedModelLabel = selectedModel?.displayName ?? modelId

  function draft(): MessageEditDraft | null {
    if (!message.uuid || !providerId || !modelId) return null
    return {
      messageId: message.id,
      messageUuid: message.uuid,
      prompt: prompt.trim(),
      attachments,
      providerId,
      modelId,
      permissionMode,
    }
  }

  async function handlePrepare() {
    const currentDraft = draft()
    if (!currentDraft || (!currentDraft.prompt && !attachments.length) || isSubmitting) return

    setIsSubmitting(true)
    try {
      const result = await config.onPrepare(currentDraft)
      if (result.status === 'sent') {
        onCancel()
      } else if (result.status === 'confirm') {
        setConfirmation(result)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleConfirmed(shouldRewindFiles: boolean) {
    const currentDraft = draft()
    const currentConfirmation = confirmation
    if (!currentDraft || !currentConfirmation || isSubmitting) return

    setIsSubmitting(true)
    try {
      const sent = await config.onSubmit(
        currentDraft,
        currentConfirmation.editTarget,
        shouldRewindFiles,
      )
      if (sent) onCancel()
    } finally {
      setIsSubmitting(false)
      setConfirmation(undefined)
    }
  }

  function handleCancel() {
    config.onCancelPreparation()
    onCancel()
  }

  const changedFiles = confirmation?.preview.filesChanged ?? []

  return (
    <>
      <div className="w-full" data-message-edit-surface={interactionScope}>
        <PromptComposer
          appearance="message-edit"
          attachments={attachments}
          autoFocus
          availableCommands={config.availableCommands}
          canSubmit={Boolean((prompt.trim() || attachments.length) && providerId && modelId)}
          canUsePrompt
          contextUsage={null}
          isMockProject={false}
          isStreaming={false}
          isSubmitting={isSubmitting}
          interactionScope={interactionScope}
          model={modelId}
          modelOptions={config.modelOptions}
          permissionMode={permissionMode}
          prompt={prompt}
          projectPath={config.projectPath}
          selectedModelLabel={selectedModelLabel}
          selectedProviderId={providerId}
          setPermissionMode={setPermissionMode}
          setAttachments={setAttachments}
          setPrompt={setPrompt}
          setSelectedProviderModel={(nextProviderId, nextModelId) => {
            setProviderId(nextProviderId)
            setModelId(nextModelId)
          }}
          slashMenuPlacement="below"
          onSelectFiles={config.onSelectFiles}
          onCancel={handleCancel}
          onStop={() => {}}
          onSubmit={() => void handlePrepare()}
        />
      </div>

      <AppAlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
            config.onCancelPreparation()
            setConfirmation(undefined)
          }
        }}
      >
        <AppAlertDialogContent className="sm:max-w-md" data-message-edit-surface={interactionScope}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('workbench.edit.resendTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('workbench.edit.resendDescription', {
                files: changedFiles.length
                  ? changedFiles.join('、')
                  : t('workbench.edit.currentFiles'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>
              {t('workbench.action.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isSubmitting}
              variant="outline"
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmed(false)
              }}
            >
              {t('workbench.edit.sendWithoutRevert')}
            </AlertDialogAction>
            <AlertDialogAction
              disabled={isSubmitting}
              onClick={(event) => {
                event.preventDefault()
                void handleConfirmed(true)
              }}
            >
              {t('workbench.edit.revertAndSend')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AppAlertDialog>
    </>
  )
}
