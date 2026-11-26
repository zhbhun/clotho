import { CircleX, MessageCircleCode } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tabs, TabsList, TabsTrigger } from '@/shadcn/tabs'

import { useAppReducedMotion } from '../../../components/theme-provider'
import { SessionContextMenu } from '../components/session-context-menu'
import { ShortcutTooltip } from '../components/shortcut-tooltip'
import { usePrimaryModifierHeld } from '../hooks/use-primary-modifier-held'
import { SessionStatus } from '../session-status'
import type { SessionActivity, WorkbenchSession } from '../stores/workbench-store'
import { sessionDisplayTitle } from '../utils/session-list'

export function SessionTabs({
  activeSessionId,
  pinnedSessionIds,
  sessionActivity,
  sessions,
  onCloseSession,
  onDeleteSession,
  onRenameSession,
  onSelectSession,
  onTogglePinSession,
}: {
  activeSessionId: string | null
  pinnedSessionIds: ReadonlySet<string>
  sessionActivity: Record<string, SessionActivity>
  sessions: WorkbenchSession[]
  onCloseSession: (session: WorkbenchSession) => void
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onSelectSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const activeTabRef = useRef<HTMLDivElement>(null)
  const sessionOrder = sessions.map((session) => session.id).join('\u0000')
  const hasRevealedInitialTabRef = useRef(false)
  const isReducedMotion = useAppReducedMotion()
  const isPrimaryHeld = usePrimaryModifierHeld()

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const activeTab = activeTabRef.current
    if (!scroller || !activeTab) return

    const isInitialReveal = !hasRevealedInitialTabRef.current
    hasRevealedInitialTabRef.current = true
    revealActiveTab(scroller, activeTab, isInitialReveal || isReducedMotion ? 'auto' : 'smooth')
  }, [activeSessionId, sessionOrder, isReducedMotion])

  const handleTabChange = (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (session) onSelectSession(session)
  }

  return (
    <Tabs
      ref={scrollerRef}
      className="no-scrollbar min-w-0 flex-1 items-center gap-0 overflow-x-auto overflow-y-hidden pl-0.75 data-[orientation=horizontal]:flex-row"
      value={activeSessionId ?? ''}
      onValueChange={handleTabChange}
    >
      <TabsList className="app-region-no-drag min-w-max justify-start gap-1 bg-transparent p-0">
        {sessions.map((session, index) => {
          const title = sessionDisplayTitle(session, t)
          const displayTitle = title
          const activity = sessionActivity[session.id] ?? 'idle'
          const isActive = session.id === activeSessionId
          const shortcutNumber = index < 9 ? index + 1 : null

          return (
            <SessionContextMenu
              close={{ onCloseSession, sessions }}
              isPinned={pinnedSessionIds.has(session.id)}
              key={session.id}
              session={session}
              onDeleteSession={onDeleteSession}
              onRenameSession={onRenameSession}
              onTogglePinSession={onTogglePinSession}
            >
              <div
                className="session-tab group/tab relative h-8 min-w-16 max-w-60 shrink-0"
                data-active={isActive ? 'true' : undefined}
                ref={isActive ? activeTabRef : undefined}
              >
                <TabsTrigger
                  className="h-full w-full justify-start border-0 px-3 font-normal has-data-[icon=inline-start]:pl-3"
                  data-session-tab={session.id}
                  // Click must not focus the tab, or dialog close returns focus to it.
                  onMouseDown={(event) => event.preventDefault()}
                  tabIndex={-1}
                  value={session.id}
                >
                  <span
                    className="flex size-4 shrink-0 items-center justify-center transition-opacity group-hover/tab:opacity-0 group-focus-within/tab:opacity-0"
                    data-icon="inline-start"
                    data-session-tab-status-slot
                  >
                    {isPrimaryHeld && shortcutNumber ? (
                      <span className="flex size-3.5 items-center justify-center rounded-full border border-current text-[0.625rem] leading-none font-medium">
                        {shortcutNumber}
                      </span>
                    ) : (
                      <SessionStatus
                        activity={activity}
                        icon={<MessageCircleCode strokeWidth={1.5} />}
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-left">{displayTitle}</span>
                </TabsTrigger>
                <ShortcutTooltip
                  commandId="workbench.session.close"
                  label={t('workbench.session.closeTab')}
                  side="bottom"
                >
                  <Button
                    aria-label={t('workbench.session.close', { title: displayTitle })}
                    className="pointer-events-none absolute top-1/2 left-2.5 size-5 -translate-y-1/2 rounded-full bg-transparent text-foreground opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 hover:bg-transparent dark:hover:bg-transparent"
                    size="icon-sm"
                    tabIndex={-1}
                    variant="ghost"
                    onClick={() => onCloseSession(session)}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-foreground/10">
                      <CircleX className="size-3.5" data-icon="inline-start" strokeWidth={1.5} />
                    </span>
                  </Button>
                </ShortcutTooltip>
              </div>
            </SessionContextMenu>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

const REVEAL_OVERSHOOT = 100

function revealActiveTab(scroller: HTMLElement, tab: HTMLElement, behavior: ScrollBehavior) {
  const scrollerRect = scroller.getBoundingClientRect()
  const tabRect = tab.getBoundingClientRect()
  const overflowLeft = scrollerRect.left - tabRect.left
  const overflowRight = tabRect.right - scrollerRect.right

  if (overflowLeft <= 0 && overflowRight <= 0) return false

  const offset =
    overflowLeft > 0 ? -(overflowLeft + REVEAL_OVERSHOOT) : overflowRight + REVEAL_OVERSHOOT
  const maxScrollLeft = scroller.scrollWidth - scroller.clientWidth
  const targetLeft = Math.min(Math.max(0, scroller.scrollLeft + offset), maxScrollLeft)
  const didReveal = targetLeft !== scroller.scrollLeft

  if (didReveal) scroller.scrollTo({ left: targetLeft, behavior })
  return didReveal
}
