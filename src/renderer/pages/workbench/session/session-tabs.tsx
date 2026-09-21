import { MessageCircle, Plus, X } from 'lucide-react'
import { motion, useMotionValue } from 'motion/react'
import { useCallback, useLayoutEffect, useRef } from 'react'
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
import { SessionHistory } from './session-history'
import './session-tabs.css'

export function SessionTabs({
  activeSessionId,
  historyError = null,
  historyOpen,
  historySessions,
  isContentScrolled,
  isHistoryLoading = false,
  pinnedSessionIds,
  sessionActivity,
  sessions,
  onCloseSession,
  onDeleteSession,
  onHistoryOpenChange,
  onRenameSession,
  onRetryHistory = () => {},
  onSelectSession,
  onStartNewSession,
  onTogglePinSession,
}: {
  activeSessionId: string | null
  historyError?: string | null
  historyOpen?: boolean
  historySessions: WorkbenchSession[]
  isContentScrolled: boolean
  isHistoryLoading?: boolean
  pinnedSessionIds: ReadonlySet<string>
  sessionActivity: Record<string, SessionActivity>
  sessions: WorkbenchSession[]
  onCloseSession: (session: WorkbenchSession) => void
  onDeleteSession: (session: WorkbenchSession) => void
  onHistoryOpenChange?: (isOpen: boolean) => void
  onRenameSession: (session: WorkbenchSession) => void
  onRetryHistory?: () => void
  onSelectSession: (session: WorkbenchSession) => void
  onStartNewSession: () => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  const activeSurfaceX = useMotionValue(0)
  const activeSurfaceWidth = useMotionValue(0)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef(new Map<string, HTMLDivElement>())
  const sessionOrder = sessions.map((session) => session.id).join('\u0000')
  const hasRevealedInitialTabRef = useRef(false)
  const isReducedMotion = useAppReducedMotion()
  const isPrimaryHeld = usePrimaryModifierHeld()

  const handleTabRef = useCallback((sessionId: string, element: HTMLDivElement | null) => {
    if (element) {
      tabRefs.current.set(sessionId, element)
    } else {
      tabRefs.current.delete(sessionId)
    }
  }, [])

  useLayoutEffect(() => {
    const activeTab = activeSessionId ? tabRefs.current.get(activeSessionId) : undefined

    if (!activeTab) return

    const updatePosition = () => {
      activeSurfaceX.set(activeTab.offsetLeft)
      activeSurfaceWidth.set(activeTab.offsetWidth)
    }

    const isInitialReveal = !hasRevealedInitialTabRef.current
    hasRevealedInitialTabRef.current = true
    const scroller = scrollerRef.current
    if (scroller) {
      revealActiveTab(scroller, activeTab, isInitialReveal || isReducedMotion ? 'auto' : 'smooth')
    }

    updatePosition()

    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => updatePosition())

    if (observer) {
      for (const tab of tabRefs.current.values()) observer.observe(tab)
      if (tabListRef.current) observer.observe(tabListRef.current)
    }

    return () => {
      observer?.disconnect()
    }
  }, [activeSessionId, activeSurfaceWidth, activeSurfaceX, sessionOrder, isReducedMotion])

  const handleTabChange = (sessionId: string) => {
    const session = sessions.find((candidate) => candidate.id === sessionId)
    if (session) onSelectSession(session)
  }

  // The active session can be an invisible blank draft (no tab rendered): keep
  // the active surface hidden instead of showing it over a stale position.
  const isActiveTabVisible = sessions.some((session) => session.id === activeSessionId)

  return (
    <div
      className="session-tabs relative -mt-1 flex h-10 min-w-0 shrink-0 items-stretch bg-background"
      data-content-scrolled={isContentScrolled ? 'true' : undefined}
    >
      <Tabs
        ref={scrollerRef}
        className="no-scrollbar min-w-0 flex-1 gap-0 overflow-x-auto overflow-y-hidden pt-1 pl-3 data-[orientation=horizontal]:flex-row"
        value={activeSessionId ?? ''}
        onValueChange={handleTabChange}
      >
        <TabsList
          className="relative isolate min-w-max justify-start gap-0 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-9"
          ref={tabListRef}
        >
          <motion.div
            className="session-tab-active-surface"
            data-visible={isActiveTabVisible ? 'true' : undefined}
            data-session-tab-active-surface
            style={{ x: activeSurfaceX, width: activeSurfaceWidth }}
          />
          {sessions.map((session, index) => {
            const title = sessionDisplayTitle(session, t)
            const displayTitle = title
            const activity = session.isDraft ? 'idle' : (sessionActivity[session.id] ?? 'idle')
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
                  className="session-tab group/tab relative h-9 min-w-16 max-w-60 shrink-0"
                  data-active={isActive ? 'true' : undefined}
                  ref={(element) => handleTabRef(session.id, element)}
                >
                  <TabsTrigger
                    className="h-full w-full justify-start rounded-none border-0 bg-transparent pr-3 pl-2.5 text-sm font-normal hover:text-foreground has-data-[icon=inline-start]:pl-2.5 data-active:bg-transparent data-active:text-foreground data-active:hover:text-foreground dark:data-active:bg-transparent"
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
                      ) : activity === 'idle' ? (
                        <MessageCircle />
                      ) : (
                        <SessionStatus activity={activity} />
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
                      className="pointer-events-none absolute top-1/2 left-2 size-5 -translate-y-1/2 rounded-full bg-transparent text-foreground-subtlest opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 hover:bg-accent hover:text-foreground dark:hover:bg-accent"
                      size="icon-sm"
                      tabIndex={-1}
                      variant="ghost"
                      onClick={() => onCloseSession(session)}
                    >
                      <X data-icon="inline-start" />
                    </Button>
                  </ShortcutTooltip>
                </div>
              </SessionContextMenu>
            )
          })}
        </TabsList>
      </Tabs>

      <div className="session-tab-actions relative flex shrink-0 items-center gap-0.5 px-1 text-foreground-subtlest">
        <ShortcutTooltip
          commandId="workbench.session.new"
          label={t('workbench.session.new')}
          side="bottom"
        >
          <Button
            aria-label={t('workbench.session.new')}
            size="icon"
            variant="mute"
            onClick={onStartNewSession}
          >
            <Plus className="size-4" strokeWidth={1.5} />
          </Button>
        </ShortcutTooltip>
        <SessionHistory
          activeSessionId={activeSessionId}
          error={historyError}
          isLoading={isHistoryLoading}
          open={historyOpen}
          sessions={historySessions}
          onOpenChange={onHistoryOpenChange}
          onRetry={onRetryHistory}
          onSelectSession={onSelectSession}
        />
      </div>
    </div>
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
