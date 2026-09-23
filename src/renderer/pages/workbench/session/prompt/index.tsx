import { ArrowUp, ChevronDown, Play, Square, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Card, CardContent, CardFooter } from '@/shadcn/card'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import { cn } from '@/shadcn/utils'
import type { ClaudeAttachment, ClaudeAttachmentReadResult } from '@/shared/rpc'

import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuTrigger,
} from '../../../../components/menu'
import { ProviderUsageRings } from '../../../../components/model-configuration/provider-usage-badges'
import {
  PERMISSION_MODE_OPTIONS,
  permissionModeOption,
} from '../../../../components/permission-mode'
import { useCommandHandler } from '../../../../hooks/use-command-handler'
import type {
  ClaudeModelInfo,
  ClaudePermissionMode,
  ClaudeSlashCommand,
} from '../../../../services/claude/claude'
import { useModelConfigurationStore } from '../../../../stores/model-configuration-context'
import { useProviderUsageStore } from '../../../../stores/provider-usage-context'
import { AttachmentList } from '../components/attachment-list'
import {
  type AttachmentUpdate,
  appendLoadedAttachments,
  loadedToAttachment,
  readPastedFiles,
  readPickedFiles,
} from '../services/attachments'
import { AddMenu } from './add-menu'
import {
  type ContextUsage,
  type ContextUsageDetail,
  ContextUsagePopover,
} from './context-usage-popover'
import { ContextUsageRing, ContextUsageSamplingRing } from './context-usage-ring'
import { type PromptEditorHandle, PromptMarkdownEditor } from './editor'
import {
  ModelBrandIcon,
  getVisibleModelOptions,
  groupModelOptionsByProvider,
  resolveSelectedModelIconOption,
} from './model-brand-icon'
import './prompt.css'
import { resolveDirectSlashCommand } from './slash-command'

export const COMPOSER_CONTROL_CLASS = 'rounded-full text-foreground-subtlest shadow-none'
const COMPOSER_TEXT_CONTROL_CLASS = cn(COMPOSER_CONTROL_CLASS, 'px-2.5!')

function PromptComposerShortcuts({
  canSelectFiles,
  onOpenModel,
  onOpenPermission,
  onSelectFiles,
}: {
  canSelectFiles: boolean
  onOpenModel: () => void
  onOpenPermission: () => void
  onSelectFiles: () => Promise<void>
}) {
  useCommandHandler('workbench.picker.permission.open', onOpenPermission)
  useCommandHandler('workbench.picker.model.open', onOpenModel)
  useCommandHandler('workbench.picker.file.open', onSelectFiles, { enabled: canSelectFiles })

  return null
}

export type PromptComposerProps = {
  appearance?: 'default' | 'message-edit'
  autoFocus?: boolean
  attachments: ClaudeAttachment[]
  availableCommands: ClaudeSlashCommand[]
  canSubmit: boolean
  canUsePrompt: boolean
  /** The latest turn was interrupted after content streamed and can be resumed. */
  canResume?: boolean
  className?: string
  /** Real context-window usage from the latest SDK snapshot; null hides the ring. */
  contextUsage: ContextUsage | null
  contextUsageDetail?: ContextUsageDetail
  /** An on-demand usage sample is in flight; shows a spinner where the ring appears. */
  isSamplingContext?: boolean
  isElevated?: boolean
  isMockProject: boolean
  isSubmitting?: boolean
  isStreaming: boolean
  interactionScope?: string
  model: string
  modelOptions: ClaudeModelInfo[]
  /** Executes a slash command without sending it as a regular prompt. */
  onRunCommand?: (command: ClaudeSlashCommand) => void
  permissionMode: ClaudePermissionMode
  prompt: string
  projectPath?: string
  selectedModelLabel: string
  selectedProviderId: string
  shadowDirection?: 'ambient' | 'downward'
  setSelectedProviderModel: (providerId: string, modelId: string) => void
  setPermissionMode: (mode: ClaudePermissionMode) => void
  setPrompt: (prompt: string) => void
  setAttachments: (update: AttachmentUpdate) => void
  slashMenuPlacement: 'above' | 'below'
  onSelectFiles: (startingFolder?: string) => Promise<string[]>
  onCancel?: () => void
  onStop: () => void
  onSubmit: () => void
  /** Send the hidden auto-continuation nudge for the interrupted turn. */
  onResume?: () => void
}

/** Composer props carrying session data; placement props (`className`, `shadowDirection`, `slashMenuPlacement`) belong to the surrounding surface. */
export type PromptComposerBaseProps = Omit<
  PromptComposerProps,
  'className' | 'shadowDirection' | 'slashMenuPlacement'
>

export function PromptComposer({
  appearance = 'default',
  autoFocus = false,
  attachments,
  availableCommands,
  canSubmit,
  canUsePrompt,
  canResume,
  className,
  contextUsage,
  contextUsageDetail,
  isSamplingContext = false,
  isElevated = true,
  isMockProject,
  isSubmitting = false,
  isStreaming,
  interactionScope,
  model,
  modelOptions,
  onRunCommand,
  permissionMode,
  prompt,
  projectPath,
  selectedModelLabel,
  selectedProviderId,
  shadowDirection = 'ambient',
  setSelectedProviderModel,
  setPermissionMode,
  setPrompt,
  setAttachments,
  slashMenuPlacement,
  onSelectFiles,
  onCancel,
  onStop,
  onSubmit,
  onResume,
}: PromptComposerProps) {
  const { t } = useTranslation()
  const [isPermissionMenuOpen, setIsPermissionMenuOpen] = useState(false)
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false)
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(false)
  const promptEditorRef = useRef<PromptEditorHandle | null>(null)
  const providers = useModelConfigurationStore((state) => state.providers)
  const providersById = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers])
  const usageByProviderId = useProviderUsageStore((state) => state.usage)
  const refreshProviderUsage = useProviderUsageStore((state) => state.refreshAll)

  function notifyRejected(rejected: ClaudeAttachmentReadResult['rejected']) {
    if (!rejected.length) return
    toast.add({
      id: 'workbench-attachment-unsupported',
      title: t('workbench.error.attachmentUnsupported'),
      description: t('workbench.error.attachmentUnsupportedDetail', {
        names: rejected.map((item) => item.name).join(', '),
      }),
      type: 'error',
    })
  }

  function applyLoaded(result: ClaudeAttachmentReadResult) {
    notifyRejected(result.rejected)
    if (result.attachments.length) {
      setAttachments((current) =>
        appendLoadedAttachments(current, result.attachments.map(loadedToAttachment)),
      )
    }
  }

  function importFailed() {
    toast.add({
      id: 'workbench-attachment-import-failed',
      title: t('workbench.error.attachmentImportFailed'),
      type: 'error',
    })
  }

  async function handleAddFiles() {
    try {
      const selectedFiles = await onSelectFiles(projectPath)
      if (!selectedFiles.length) return
      const existing = new Set(
        attachments.map((attachment) => attachment.content?.source.path ?? null),
      )
      const files = selectedFiles
        .filter((sourcePath) => !existing.has(sourcePath))
        .map((sourcePath) => ({
          name: sourcePath.split(/[\\/]/).filter(Boolean).at(-1) ?? sourcePath,
          sourcePath,
        }))
      if (!files.length) return
      applyLoaded(await readPickedFiles(files))
    } catch {
      toast.add({
        id: 'workbench-select-files-error',
        title: t('workbench.error.selectFilesFailed'),
        type: 'error',
      })
    }
  }

  function handlePasteFiles(files: File[]) {
    readPastedFiles(files).then(applyLoaded, importFailed)
  }

  function handleSubmit() {
    if (!canSubmit) return

    const directCommand = resolveDirectSlashCommand(prompt)
    if (directCommand && (onRunCommand || (directCommand === 'context' && contextUsageDetail))) {
      setPrompt('')
      if (directCommand === 'context') {
        contextUsageDetail?.onOpen()
        if (contextUsageDetail) setIsContextPanelOpen(true)
        return
      }
      onRunCommand?.({ name: directCommand })
      return
    }

    onSubmit()
  }

  const selectedModelIconOption = resolveSelectedModelIconOption(
    model,
    modelOptions,
    selectedProviderId,
  ) ?? {
    value: model,
    displayName: selectedModelLabel,
    description: '',
  }
  const selectedModelDisplayName = selectedModelIconOption.displayName
  const visibleModelOptions = getVisibleModelOptions(modelOptions)
  const modelGroups = groupModelOptionsByProvider(
    visibleModelOptions,
    t('workbench.prompt.otherProvider'),
  )
  const canSelectFiles = !isMockProject && canUsePrompt && !isStreaming && !isSubmitting
  // The resume (play) action replaces the send button only while the composer
  // is empty — any typed content sends as a new regular prompt instead.
  const showResumeButton = Boolean(canResume && onResume && !prompt.trim() && !attachments.length)
  const selectedPermissionOption = permissionModeOption(permissionMode)
  const PermissionIcon = selectedPermissionOption.icon

  return (
    <Card
      className={cn(
        'group/composer @container w-full overflow-hidden rounded-2xl text-sm [--card-spacing:--spacing(3)]',
        appearance === 'default' && 'prompt-composer-surface ring-0',
        appearance === 'message-edit' &&
          'max-h-[450px] min-h-0 rounded-lg rounded-br-none border-border/60 bg-muted shadow-none',
        className,
      )}
      data-elevated={appearance === 'default' && isElevated ? 'true' : undefined}
      data-shadow-direction={appearance === 'default' ? shadowDirection : undefined}
    >
      {appearance === 'default' ? (
        <PromptComposerShortcuts
          canSelectFiles={canSelectFiles}
          onOpenPermission={() => {
            setIsModelMenuOpen(false)
            setIsPermissionMenuOpen(true)
          }}
          onOpenModel={() => {
            if (!modelOptions.length) return
            setIsPermissionMenuOpen(false)
            setIsModelMenuOpen(true)
          }}
          onSelectFiles={handleAddFiles}
        />
      ) : null}
      <CardContent className="flex min-h-0 flex-col">
        {attachments.length ? (
          <AttachmentList
            attachments={attachments}
            disabled={!canSelectFiles}
            isEmbedded={appearance === 'message-edit'}
            onRemove={(index) => {
              setAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index))
            }}
          />
        ) : null}
        <PromptMarkdownEditor
          autoFocus={autoFocus}
          availableCommands={availableCommands}
          disabled={isMockProject || !canUsePrompt || isStreaming || isSubmitting}
          interactionScope={interactionScope}
          onPasteFiles={handlePasteFiles}
          placeholder={
            isMockProject
              ? t('workbench.prompt.mockReadonly')
              : canUsePrompt
                ? t('workbench.prompt.placeholder')
                : t('workbench.prompt.selectProject')
          }
          projectPath={projectPath}
          ref={promptEditorRef}
          slashMenuPlacement={slashMenuPlacement}
          value={prompt}
          onChange={setPrompt}
          onSubmit={handleSubmit}
        />
      </CardContent>
      <CardFooter className="shrink-0 gap-1">
        <AddMenu
          canSelectFiles={canSelectFiles}
          commands={availableCommands}
          editorHandle={promptEditorRef}
          interactionScope={interactionScope}
          onSelectFiles={() => void handleAddFiles()}
          onQueryContextStatus={() => {
            contextUsageDetail?.onOpen()
            setIsContextPanelOpen(true)
          }}
          onRunCommand={onRunCommand}
        />

        <Menu
          open={isPermissionMenuOpen}
          onOpenChange={(open) => {
            setIsPermissionMenuOpen(open)
            if (open) setIsModelMenuOpen(false)
          }}
        >
          <MenuTrigger
            render={
              <Button
                aria-label={t('permission.mode.menuLabel')}
                className={COMPOSER_TEXT_CONTROL_CLASS}
                type="button"
                variant="ghost"
              />
            }
          >
            <PermissionIcon
              data-icon="inline-start"
              className={selectedPermissionOption.accentClassName}
            />
            <span className="@max-[449px]:hidden">{t(selectedPermissionOption.labelKey)}</span>
            <ChevronDown className="@max-[449px]:hidden" data-icon="inline-end" strokeWidth={1} />
          </MenuTrigger>
          <MenuContent
            aria-label={t('permission.mode.menuLabel')}
            align="start"
            className="w-80 shadow-float"
            data-message-edit-surface={interactionScope}
            glass
          >
            <MenuList>
              {PERMISSION_MODE_OPTIONS.map((option) => (
                <MenuItem
                  selected={permissionMode === option.value}
                  key={option.value}
                  onSelect={() => setPermissionMode(option.value)}
                >
                  <option.icon data-icon="inline-start" />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-sm/5 whitespace-nowrap">{t(option.labelKey)}</span>
                    <span className="truncate text-[12px] leading-4 text-foreground-subtlest!">
                      {t(option.descriptionKey)}
                    </span>
                  </span>
                </MenuItem>
              ))}
            </MenuList>
          </MenuContent>
        </Menu>

        <div className="ml-auto flex items-center gap-1">
          {onCancel ? (
            <Button
              aria-label={t('workbench.prompt.cancelEdit')}
              className="rounded-full"
              disabled={isSubmitting}
              size="icon"
              type="button"
              variant="mute"
              onClick={onCancel}
            >
              <X data-icon />
            </Button>
          ) : null}

          {contextUsage ? (
            contextUsageDetail ? (
              <ContextUsagePopover
                detail={contextUsageDetail}
                open={isContextPanelOpen}
                usage={contextUsage}
                onOpenChange={setIsContextPanelOpen}
              >
                <ContextUsageRing usage={contextUsage} />
              </ContextUsagePopover>
            ) : (
              <ContextUsageRing usage={contextUsage} />
            )
          ) : isSamplingContext ? (
            <ContextUsageSamplingRing />
          ) : null}

          {model ? (
            <Menu
              open={isModelMenuOpen}
              onOpenChange={(open) => {
                setIsModelMenuOpen(open)
                if (open) {
                  setIsPermissionMenuOpen(false)
                  // Fresh quota on every open; the shared store dedupes
                  // in-flight queries and keeps cached pills until new
                  // results land.
                  void refreshProviderUsage(providers).catch(() => {})
                }
              }}
            >
              <MenuTrigger
                render={
                  <Button
                    className={COMPOSER_TEXT_CONTROL_CLASS}
                    disabled={!modelOptions.length}
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <ModelBrandIcon
                  displayName={selectedModelIconOption.displayName}
                  value={selectedModelIconOption.value}
                  provider={
                    selectedModelIconOption.providerId
                      ? providersById.get(selectedModelIconOption.providerId)
                      : undefined
                  }
                />
                <span className="@max-[449px]:hidden">{selectedModelDisplayName}</span>
                <ChevronDown
                  className="@max-[449px]:hidden"
                  data-icon="inline-end"
                  strokeWidth={1}
                />
              </MenuTrigger>
              <MenuContent
                aria-label={t('workbench.prompt.modelSelection')}
                align="end"
                className="w-64 whitespace-nowrap shadow-float"
                data-message-edit-surface={interactionScope}
                glass
              >
                <MenuSearch placeholder={t('workbench.prompt.searchModels')} />
                <MenuList>
                  {modelGroups.map((group) => {
                    const usage = group.providerId ? usageByProviderId[group.providerId] : undefined
                    return (
                      <MenuGroup
                        heading={
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate">{group.providerName}</span>
                            <ProviderUsageRings quota={usage} />
                          </span>
                        }
                        key={group.providerId || group.providerName}
                      >
                        {group.items.map((option) => (
                          <MenuItem
                            selected={
                              selectedModelIconOption.providerId === option.providerId &&
                              selectedModelIconOption.value === option.value
                            }
                            key={`${group.providerId}-${option.value}`}
                            onSelect={() => {
                              if (option.providerId) {
                                setSelectedProviderModel(option.providerId, option.value)
                              }
                            }}
                          >
                            <ModelBrandIcon
                              displayName={option.displayName}
                              value={option.value}
                              provider={
                                option.providerId ? providersById.get(option.providerId) : undefined
                              }
                            />
                            {option.displayName}
                          </MenuItem>
                        ))}
                      </MenuGroup>
                    )
                  })}
                </MenuList>
              </MenuContent>
            </Menu>
          ) : null}

          <Button
            aria-label={
              isStreaming
                ? t('workbench.prompt.stop')
                : isSubmitting
                  ? t('workbench.prompt.sending')
                  : showResumeButton
                    ? t('workbench.prompt.resume')
                    : t('workbench.prompt.send')
            }
            className={cn('rounded-full', appearance === 'default' && 'prompt-composer-send')}
            disabled={isStreaming ? false : isSubmitting || (!showResumeButton && !canSubmit)}
            size="icon"
            type="button"
            onClick={isStreaming ? onStop : showResumeButton ? onResume : handleSubmit}
          >
            {isStreaming ? (
              <Square className="size-3" fill="currentColor" strokeWidth={1} />
            ) : isSubmitting ? (
              <Spinner />
            ) : showResumeButton ? (
              <Play className="size-3.5 translate-x-px" fill="currentColor" strokeWidth={1} />
            ) : (
              <ArrowUp />
            )}
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
