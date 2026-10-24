import { Clock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import { Menu, MenuTrigger } from '../../../components/menu'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import type { SessionActivity, WorkbenchSession } from '../stores/workbench-store'
import { SessionHistoryMenuContent } from './session-history-menu'

/** History button; clicking opens the dropdown history menu, while the picker
    shortcut opens the quick switcher's session mode instead. */
export function SessionHistoryButton({
  activeSessionId,
  error = null,
  isLoading = false,
  pinnedSessionIds,
  sessionActivity = {},
  sessions,
  onRetry = () => {},
  onDeleteSession,
  onRenameSession,
  onSelectSession,
  onTogglePinSession,
}: {
  activeSessionId: string | null
  error?: string | null
  isLoading?: boolean
  pinnedSessionIds?: ReadonlySet<string>
  sessionActivity?: Record<string, SessionActivity>
  sessions: WorkbenchSession[]
  onRetry?: () => void
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onSelectSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Menu
      open={isOpen}
      onOpenChange={(open, details) => {
        // A press inside a row's "..." popup is logically inside this menu:
        // keep the history menu open while the row menu handles the action.
        if (!open && details.reason === 'outside-press') {
          const target = details.event.target
          if (target instanceof Element && target.closest('[data-session-history-row-menu]')) {
            return
          }
        }
        setIsOpen(open)
      }}
    >
      <ShortcutTooltip
        commandId="workbench.picker.session.open"
        label={t('workbench.history.title')}
        side="bottom"
      >
        <MenuTrigger
          render={<Button aria-label={t('workbench.history.title')} size="icon" variant="mute" />}
        >
          <Clock data-icon="inline-start" strokeWidth={1.5} />
        </MenuTrigger>
      </ShortcutTooltip>
      <SessionHistoryMenuContent
        activeSessionId={activeSessionId}
        error={error}
        isLoading={isLoading}
        pinnedSessionIds={pinnedSessionIds}
        sessionActivity={sessionActivity}
        sessions={sessions}
        onRetry={onRetry}
        onDeleteSession={onDeleteSession}
        onRenameSession={onRenameSession}
        onSelectSession={onSelectSession}
        onTogglePinSession={onTogglePinSession}
      />
    </Menu>
  )
}
