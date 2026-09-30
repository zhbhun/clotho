import { MessageCircleCode } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/shadcn/skeleton'

import {
  MenuContent,
  MenuEmpty,
  MenuGroup,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuSeparator,
} from '../../../components/menu'
import { LoadFailure } from '../components/loading-state'
import { SessionStatus } from '../session-status'
import type { SessionActivity, WorkbenchSession } from '../stores/workbench-store'
import { sessionTimeLabel, sessionTitle } from '../utils/session-list'

export type SessionHistoryMenuContentProps = {
  activeSessionId: string | null
  error?: string | null
  isLoading?: boolean
  sessionActivity?: Record<string, SessionActivity>
  sessions: WorkbenchSession[]
  onRetry?: () => void
  onSelectSession: (session: WorkbenchSession) => void
}

/** Dropdown body for the history button: searchable session rows mirroring the
    palette dialog's loading, error, and empty states. */
export function SessionHistoryMenuContent({
  activeSessionId,
  error = null,
  isLoading = false,
  sessionActivity = {},
  sessions,
  onRetry = () => {},
  onSelectSession,
}: SessionHistoryMenuContentProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const now = new Date()

  return (
    <MenuContent
      align="end"
      aria-label={t('workbench.history.title')}
      className="w-[min(400px,calc(100vw-2rem))] shadow-float"
      glass
    >
      <MenuSearch
        disabled={isLoading || Boolean(error)}
        placeholder={String(t('workbench.history.search'))}
      />
      <MenuSeparator />
      <MenuList aria-busy={isLoading}>
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
            <MenuEmpty>
              {sessions.length ? t('workbench.history.empty') : t('workbench.history.noSessions')}
            </MenuEmpty>
            <MenuGroup>
              {sessions.map((session) => {
                const time = sessionTimeLabel(session.created_at, now, t, locale)
                const activity = session.isDraft ? 'idle' : (sessionActivity[session.id] ?? 'idle')

                return (
                  <MenuItem
                    key={session.id}
                    keywords={[sessionTitle(session)]}
                    selected={session.id === activeSessionId}
                    // The value drives cmdk's single keyboard highlight, so it
                    // must be unique; searchable text lives in the keywords.
                    value={session.id}
                    onSelect={() => onSelectSession(session)}
                  >
                    <SessionStatus
                      activity={activity}
                      icon={<MessageCircleCode className="size-4" strokeWidth={1.5} />}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm/5">
                      {sessionTitle(session)}
                    </span>
                    <span className="shrink-0 text-[12px] text-foreground-subtlest">{time}</span>
                  </MenuItem>
                )
              })}
            </MenuGroup>
          </>
        )}
      </MenuList>
    </MenuContent>
  )
}

export function SessionHistorySkeleton() {
  return (
    <div aria-hidden="true" data-session-history-skeleton>
      {[72, 58, 81, 64].map((width) => (
        <div className="flex min-h-8 items-center gap-2 rounded-md px-2.5" key={width}>
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  )
}
