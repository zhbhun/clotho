import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import { Menu, MenuTrigger } from '../../../components/menu'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import type { SessionActivity, WorkbenchSession } from '../stores/workbench-store'
import { SessionHistoryMenuContent } from './session-history-menu'

/** History button; clicking opens the dropdown history menu, while the picker
    shortcut opens the quick switcher's session mode instead. */
export function SessionHistoryButton({
  appearance = 'default',
  activeSessionId,
  error = null,
  isLoading = false,
  sessionActivity = {},
  sessions,
  onRetry = () => {},
  onSelectSession,
}: {
  appearance?: 'default' | 'empty-surface'
  activeSessionId: string | null
  error?: string | null
  isLoading?: boolean
  sessionActivity?: Record<string, SessionActivity>
  sessions: WorkbenchSession[]
  onRetry?: () => void
  onSelectSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()

  return (
    <Menu>
      <ShortcutTooltip
        commandId="workbench.picker.session.open"
        label={t('workbench.history.title')}
        side="bottom"
      >
        <MenuTrigger
          render={
            <Button
              aria-label={t('workbench.history.title')}
              className={appearance === 'empty-surface' ? 'ml-auto rounded-xl' : undefined}
              size="icon"
              variant={appearance === 'empty-surface' ? 'surface' : 'mute'}
            />
          }
        >
          <Clock data-icon="inline-start" strokeWidth={1.5} />
        </MenuTrigger>
      </ShortcutTooltip>
      <SessionHistoryMenuContent
        activeSessionId={activeSessionId}
        error={error}
        isLoading={isLoading}
        sessionActivity={sessionActivity}
        sessions={sessions}
        onRetry={onRetry}
        onSelectSession={onSelectSession}
      />
    </Menu>
  )
}
