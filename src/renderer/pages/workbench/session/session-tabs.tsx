import { MessageCircleCode, X } from 'lucide-react'
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
import './session-tabs.css'

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
      // Inset the surface by SURFACE_INSET_X so its horizontal extents match the
      // hover highlight (.session-tab::before, inset 2px 3px): selecting a tab
      // then only morphs the shape vertically instead of jumping sideways.
      activeSurfaceX.set(activeTab.offsetLeft + ACTIVE_SURFACE_INSET_X)
      activeSurfaceWidth.set(activeTab.offsetWidth - ACTIVE_SURFACE_INSET_X * 2)
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
    <Tabs
      ref={scrollerRef}
      /* 9px + the tab surfaces' 3px inset = the 12px visual gap to the project button. */
      className="no-scrollbar min-w-0 flex-1 items-center gap-0 overflow-x-auto overflow-y-hidden pl-2.25 data-[orientation=horizontal]:flex-row"
      value={activeSessionId ?? ''}
      onValueChange={handleTabChange}
    >
      <TabsList
        className="app-region-no-drag relative isolate min-w-max justify-start gap-0 rounded-none bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-8"
        ref={tabListRef}
      >
        <motion.div
          className="session-tab-active-surface"
          data-visible={isActiveTabVisible ? 'true' : undefined}
          data-session-tab-active-surface
          style={{ x: activeSurfaceX, width: activeSurfaceWidth }}
        >
          {/* Chrome-style bottom flares: quarter-circle fillets that leave the
              side edge vertically and meet the divider horizontally, tangent on
              both ends. Fixed size so the width spring never distorts them. The
              curve endpoints sit on the 1px divider lines' centers (0.5px in
              from the svg edges) so the strokes join without a pixel offset. */}
          <svg
            aria-hidden
            className="session-tab-active-flank"
            data-side="left"
            viewBox="0 0 13 12"
          >
            <path
              className="session-tab-active-flank-fill"
              d="M0.5 11.5 C7.13 11.5 12.5 6.63 12.5 0 L13 0 L13 12 L0 12 Z"
            />
            <path
              className="session-tab-active-flank-edge"
              d="M0.5 11.5 C7.13 11.5 12.5 6.63 12.5 0"
            />
          </svg>
          <svg
            aria-hidden
            className="session-tab-active-flank"
            data-side="right"
            viewBox="0 0 13 12"
          >
            <path
              className="session-tab-active-flank-fill"
              d="M12.5 11.5 C5.87 11.5 0.5 6.63 0.5 0 L0 0 L0 12 L13 12 Z"
            />
            <path
              className="session-tab-active-flank-edge"
              d="M12.5 11.5 C5.87 11.5 0.5 6.63 0.5 0"
            />
          </svg>
        </motion.div>
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
                className="session-tab group/tab relative h-8 min-w-16 max-w-60 shrink-0"
                data-active={isActive ? 'true' : undefined}
                ref={(element) => handleTabRef(session.id, element)}
              >
                <TabsTrigger
                  className="h-full w-full justify-start rounded-none border-0 bg-transparent px-3 text-sm font-normal hover:text-foreground has-data-[icon=inline-start]:pl-3 data-active:bg-transparent data-active:text-foreground data-active:hover:text-foreground dark:data-active:bg-transparent"
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
                      <SessionStatus activity={activity} icon={<MessageCircleCode />} />
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
                    className="pointer-events-none absolute top-1/2 left-2.5 size-5 -translate-y-1/2 rounded-full bg-transparent text-foreground-subtlest opacity-0 group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 hover:bg-accent hover:text-foreground dark:hover:bg-accent"
                    size="icon-sm"
                    tabIndex={-1}
                    variant="ghost"
                    onClick={() => onCloseSession(session)}
                  >
                    <X className="size-3.5" data-icon="inline-start" />
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
// Keep in sync with the hover highlight's horizontal inset in session-tabs.css.
const ACTIVE_SURFACE_INSET_X = 3

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
