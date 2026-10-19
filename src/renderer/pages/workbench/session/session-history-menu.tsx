import { ChevronRight, MessageCircleCode, Pin } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CommandItem } from '@/shadcn/command'
import { Skeleton } from '@/shadcn/skeleton'
import { cn } from '@/shadcn/utils'

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
import { compareSessions, sessionTimeLabel, sessionTitle } from '../utils/session-list'
import { SessionHistoryRowMenu } from './session-history-row-menu'

export type SessionHistoryMenuContentProps = {
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
}

/** Dropdown body for the history button: searchable session rows mirroring the
    palette dialog's loading, error, and empty states. Pinned sessions sort to
    the top and every row carries a hover "..." menu. Archived chats collapse
    behind a trailing toggle row that expands in place. */
export function SessionHistoryMenuContent({
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
}: SessionHistoryMenuContentProps) {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const now = new Date()
  // The popover remounts this body on every open, so the archived group
  // starts collapsed again each time.
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false)
  const activeSessions = sessions.filter((session) => !session.archived)
  const archivedSessions = sessions.filter((session) => session.archived)
  const orderedSessions = pinnedSessionIds?.size
    ? activeSessions.toSorted((left, right) => {
        const pinnedLeft = pinnedSessionIds.has(left.id) ? 0 : 1
        const pinnedRight = pinnedSessionIds.has(right.id) ? 0 : 1
        return pinnedLeft - pinnedRight || compareSessions(left, right)
      })
    : activeSessions

  const renderRow = (session: WorkbenchSession) => {
    const time = sessionTimeLabel(session.created_at, now, t, locale)
    const activity = sessionActivity[session.id] ?? 'idle'
    const isPinned = pinnedSessionIds?.has(session.id) ?? false

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
        <span className="min-w-0 truncate text-sm/5">{sessionTitle(session)}</span>
        {isPinned ? (
          <Pin className="size-3 shrink-0 text-foreground-subtlest" strokeWidth={1.5} />
        ) : null}
        <span className="shrink-0 text-[12px] text-foreground-subtlest">{time}</span>
        <span className="ml-auto flex shrink-0 items-center">
          <SessionHistoryRowMenu
            isPinned={isPinned}
            session={session}
            onDeleteSession={onDeleteSession}
            onRenameSession={onRenameSession}
            onTogglePinSession={onTogglePinSession}
          />
        </span>
      </MenuItem>
    )
  }

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
              {orderedSessions.map(renderRow)}
              {archivedSessions.length ? (
                /* A raw CommandItem: MenuItem always closes the menu on select,
                   and the toggle must stay open while it expands the group. */
                <CommandItem
                  className="cursor-pointer text-foreground-subtlest data-selected:bg-transparent data-selected:text-foreground"
                  keywords={[t('workbench.session.archived')]}
                  value="archived-group"
                  onSelect={() => setIsArchivedExpanded((expanded) => !expanded)}
                >
                  <ChevronRight
                    className={cn(
                      'size-4 shrink-0 transition-transform',
                      isArchivedExpanded && 'rotate-90',
                    )}
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 truncate text-sm/5">
                    {t('workbench.session.archived')} · {archivedSessions.length}
                  </span>
                </CommandItem>
              ) : null}
              {isArchivedExpanded ? archivedSessions.map(renderRow) : null}
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
