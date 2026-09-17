import { BotMessageSquare, Clock } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Skeleton } from '@/shadcn/skeleton'

import { LoadFailure } from '../components/loading-state'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import type { WorkbenchSession } from '../stores/workbench-store'
import { sessionTitle } from '../utils/session-list'
import { type WorkbenchTranslator, sessionDateLabel } from '../utils/session-list'
import {
  SwitcherCommand,
  SwitcherCommandDialog,
  SwitcherCommandEmpty,
  SwitcherCommandGroup,
  SwitcherCommandInput,
  SwitcherCommandItem,
  SwitcherCommandList,
} from './switcher-command'

export function sessionTimeLabel(
  seconds: number,
  now: Date,
  t: WorkbenchTranslator,
  locale: string,
) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''

  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return ''

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return t('workbench.history.justNow')
  if (elapsedSeconds < 60 * 60) {
    return t('workbench.history.minutesAgo', { count: Math.floor(elapsedSeconds / 60) })
  }

  const dateLabel = sessionDateLabel(seconds, now, t, locale)
  if (dateLabel !== t('workbench.session.today')) return dateLabel

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date)
}

export function SessionHistory({
  activeSessionId,
  appearance = 'default',
  error = null,
  isLoading = false,
  open,
  sessions,
  onOpenChange,
  onRetry = () => {},
  onSelectSession,
}: {
  activeSessionId: string | null
  appearance?: 'default' | 'empty-surface'
  error?: string | null
  isLoading?: boolean
  open?: boolean
  sessions: WorkbenchSession[]
  onOpenChange?: (isOpen: boolean) => void
  onRetry?: () => void
  onSelectSession: (session: WorkbenchSession) => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filteredSessions = normalizedQuery
    ? sessions.filter((session) =>
        sessionTitle(session).toLocaleLowerCase().includes(normalizedQuery),
      )
    : sessions
  const now = new Date()
  const isOpen = open ?? uncontrolledOpen
  const handleOpenChange = (nextOpen: boolean) => {
    if (open === undefined) setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <SwitcherCommandDialog
      description={t('workbench.history.description')}
      open={isOpen}
      title={t('workbench.history.title')}
      trigger={
        <ShortcutTooltip
          commandId="workbench.picker.session.open"
          label={t('workbench.history.title')}
          side="bottom"
        >
          <Button
            aria-label={t('workbench.history.title')}
            className={appearance === 'empty-surface' ? 'ml-auto rounded-xl' : undefined}
            size="icon"
            variant={appearance === 'empty-surface' ? 'surface' : 'mute'}
          >
            <Clock data-icon="inline-start" strokeWidth={1.5} />
          </Button>
        </ShortcutTooltip>
      }
      onOpenChange={handleOpenChange}
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

                  return (
                    <SwitcherCommandItem
                      key={session.id}
                      description={session.git_branch}
                      icon={BotMessageSquare}
                      label={sessionTitle(session)}
                      trailing={time}
                      value={session.id}
                      onSelect={() => {
                        handleOpenChange(false)
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

function SessionHistorySkeleton() {
  return (
    <div aria-hidden="true" className="space-y-1 p-1" data-session-history-skeleton>
      {[72, 58, 81, 64].map((width) => (
        <div className="flex min-h-[62px] items-center gap-3 rounded-[14px] px-3" key={width}>
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5" style={{ width: `${width}%` }} />
            <Skeleton className="h-2.5 w-2/5" />
          </div>
        </div>
      ))}
    </div>
  )
}
