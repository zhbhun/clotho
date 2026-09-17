import { AtSign, Gauge, Paperclip, Plus, Shrink, SquareSlash } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../../components/dropdown-menu'
import type { ClaudeSlashCommand } from '../../../../services/claude/claude'
import type { PromptEditorHandle } from './editor'
import { COMPOSER_CONTROL_CLASS } from './index'

function findCommandByName(commands: ClaudeSlashCommand[], name: string) {
  return commands.find((command) => command.name.replace(/^\/+/, '') === name)
}

export type AddMenuProps = {
  canSelectFiles: boolean
  commands: ClaudeSlashCommand[]
  editorHandle: React.RefObject<PromptEditorHandle | null>
  interactionScope?: string
  onSelectFiles: () => void
  onQueryContextStatus: () => void
  onRunCommand?: (command: ClaudeSlashCommand) => void
}

/**
 * Label with an optional trailing hint; the hint keeps its subtle color
 * even on the focused (accent) row.
 */
function MenuEntry({
  description,
  icon,
  label,
}: {
  description?: string
  icon: React.ReactNode
  label: string
}) {
  return (
    <>
      {icon}
      <span className="shrink-0 whitespace-nowrap">{label}</span>
      {description ? (
        <span className="min-w-0 truncate text-foreground-subtlest!">{description}</span>
      ) : null}
    </>
  )
}

const ENTRY_ICON_CLASS = 'size-3.5'

/**
 * "+" popup on the composer footer: attachments, completion triggers, and session commands.
 * Built on the native menu so the first item is focused on open and the arrow keys
 * move the item focus out of the box.
 */
export function AddMenu({
  canSelectFiles,
  commands,
  editorHandle,
  interactionScope,
  onSelectFiles,
  onQueryContextStatus,
  onRunCommand,
}: AddMenuProps) {
  const { t } = useTranslation()
  // Keep the trigger focus only for an Escape close. Clicked actions own their
  // next focus target; completion triggers explicitly return focus to the editor.
  const shouldRefocusEditorRef = useRef(false)
  const closeReasonRef = useRef<string | null>(null)

  function insertTrigger(trigger: '@' | '/') {
    shouldRefocusEditorRef.current = true
    editorHandle.current?.insertTrigger(trigger)
  }

  const compactCommand = findCommandByName(commands, 'compact')
  const clearCommand = findCommandByName(commands, 'clear')
  const hasSessionCommands = Boolean(onRunCommand && (compactCommand || clearCommand))
  const canOpenMenu = canSelectFiles || hasSessionCommands

  return (
    <DropdownMenu
      onOpenChange={(open, eventDetails) => {
        closeReasonRef.current = open ? null : eventDetails.reason
      }}
      onOpenChangeComplete={(open) => {
        if (open || !shouldRefocusEditorRef.current) return
        shouldRefocusEditorRef.current = false
        editorHandle.current?.focus()
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t('workbench.prompt.addMenu')}
            className={COMPOSER_CONTROL_CLASS}
            disabled={!canOpenMenu}
            size="icon"
            type="button"
            variant="ghost"
          />
        }
      >
        <Plus className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        aria-label={t('workbench.prompt.addMenu')}
        className="w-64 shadow-float"
        data-message-edit-surface={interactionScope}
        glass
        finalFocus={() => closeReasonRef.current === 'escape-key'}
      >
        <DropdownMenuItem disabled={!canSelectFiles} onClick={onSelectFiles}>
          <MenuEntry
            icon={<Paperclip className={ENTRY_ICON_CLASS} data-icon="inline-start" />}
            label={t('workbench.prompt.attachment')}
          />
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canSelectFiles} onClick={() => insertTrigger('@')}>
          <MenuEntry
            icon={<AtSign className={ENTRY_ICON_CLASS} data-icon="inline-start" />}
            label={t('workbench.prompt.context')}
            description={t('workbench.prompt.contextHint')}
          />
        </DropdownMenuItem>
        <DropdownMenuItem disabled={!canSelectFiles} onClick={() => insertTrigger('/')}>
          <MenuEntry
            icon={<SquareSlash className={ENTRY_ICON_CLASS} data-icon="inline-start" />}
            label={t('workbench.prompt.skill')}
            description={t('workbench.prompt.skillHint')}
          />
        </DropdownMenuItem>
        {hasSessionCommands ? (
          <>
            <DropdownMenuSeparator />
            {compactCommand ? (
              <DropdownMenuItem
                disabled={!onRunCommand || !canSelectFiles}
                onClick={() => onRunCommand?.(compactCommand)}
              >
                <MenuEntry
                  icon={<Shrink className={ENTRY_ICON_CLASS} data-icon="inline-start" />}
                  label={t('workbench.prompt.compact')}
                  description={t('workbench.prompt.compactHint')}
                />
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem onClick={onQueryContextStatus}>
              <MenuEntry
                icon={<Gauge className={ENTRY_ICON_CLASS} data-icon="inline-start" />}
                label={t('workbench.prompt.status')}
                description={t('workbench.prompt.statusHint')}
              />
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
