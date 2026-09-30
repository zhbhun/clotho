import { Clock, MessageCircleCode } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import { Menu, MenuTrigger } from '../../../components/menu'
import { LoadFailure } from '../components/loading-state'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import { SessionStatus } from '../session-status'
import type { SessionActivity, WorkbenchSession } from '../stores/workbench-store'
import { sessionTimeLabel, sessionTitle } from '../utils/session-list'
import { SessionHistoryMenuContent, SessionHistorySkeleton } from './session-history-menu'
import {
  SwitcherCommand,
  SwitcherCommandDialog,
  SwitcherCommandEmpty,
  SwitcherCommandGroup,
  SwitcherCommandInput,
  SwitcherCommandItem,
  SwitcherCommandList,
} from './switcher-command'

/** History button; clicking opens the dropdown history menu, while the
    shortcut command keeps opening the palette dialog through the store. */
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

/** The globally mounted history dialog; the session area wires `open` to the switcher store. */
export function SessionHistoryPanel({
  activeSessionId,
  error = null,
  isLoading = false,
  open,
  sessionActivity = {},
  sessions,
  onOpenChange,
  onRetry = () => {},
  onSelectSession,
}: {
  activeSessionId: string | null
  error?: string | null
  isLoading?: boolean
  open: boolean
  sessionActivity?: Record<string, SessionActivity>
  sessions: WorkbenchSession[]
  onOpenChange: (isOpen: boolean) => void
  onRetry?: () => void
  onSelectSession: (session: WorkbenchSession) => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredSessions = normalizedQuery
    ? sessions.filter((session) =>
        sessionTitle(session).toLocaleLowerCase().includes(normalizedQuery),
      )
    : sessions
  const now = new Date()

  return (
    <SwitcherCommandDialog
      description={t('workbench.history.description')}
      open={open}
      title={t('workbench.history.title')}
      onOpenChange={onOpenChange}
    >
      <SwitcherCommand defaultValue={activeSessionId ?? undefined} shouldFilter={false}>
        <SwitcherCommandInput
          disabled={isLoading || Boolean(error)}
          placeholder={String(t('workbench.history.search'))}
          value={query}
          onValueChange={setQuery}
        />
        <SwitcherCommandList aria-busy={isLoading}>
          {isLoading ? (
            <SessionHistorySkeleton />
          ) : error ? (
            <LoadFailure
              className="flex-1"
              compact
              description={t('workbench.history.loadFailed')}
              title={t('workbench.history.loadFailedTitle')}
              onRetry={onRetry}
            />
          ) : (
            <>
              <SwitcherCommandEmpty>
                {normalizedQuery ? t('workbench.history.empty') : t('workbench.history.noSessions')}
              </SwitcherCommandEmpty>
              <SwitcherCommandGroup>
                {filteredSessions.map((session) => {
                  const time = sessionTimeLabel(session.created_at, now, t, locale)
                  const activity = session.isDraft
                    ? 'idle'
                    : (sessionActivity[session.id] ?? 'idle')

                  return (
                    <SwitcherCommandItem
                      key={session.id}
                      description={time}
                      iconElement={
                        <SessionStatus
                          activity={activity}
                          icon={<MessageCircleCode className="size-4" strokeWidth={1.5} />}
                        />
                      }
                      label={sessionTitle(session)}
                      value={session.id}
                      onSelect={() => {
                        onOpenChange(false)
                        setQuery('')
                        window.setTimeout(() => onSelectSession(session), 0)
                      }}
                    />
                  )
                })}
              </SwitcherCommandGroup>
            </>
          )}
        </SwitcherCommandList>
      </SwitcherCommand>
    </SwitcherCommandDialog>
  )
}
