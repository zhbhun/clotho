import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from '@/shadcn/sidebar'

import type { WorkbenchSession } from '../stores/workbench-store'
import type { SessionTimelineGroup } from '../utils/session-list'
import { SessionItem } from './session-item'
import { SessionListActions } from './session-list-actions'
import {
  GROUP_GAP,
  GROUP_HEIGHT,
  SESSION_HEIGHT,
  type VirtualGroupRow,
  createVirtualRows,
} from './virtual-rows'

// Trackpad momentum keeps emitting scroll events after the fingers lift; a gap this
// long means the gesture has fully settled and hover may track the pointer again.
const SCROLL_SETTLE_MS = 150

function hoveredSessionId(scrollElement: HTMLElement) {
  // Read the browser's own hover chain at gesture start, before the pointer-events
  // suppression kicks in and rows stop being hovered at all.
  return (
    scrollElement.querySelector('[data-session-item]:hover')?.getAttribute('data-session-item') ??
    null
  )
}

function GroupLabel({ label }: { label: string }) {
  return (
    <SidebarGroupLabel className="h-8 px-2 text-sm font-normal text-foreground-subtlest">
      {label}
    </SidebarGroupLabel>
  )
}

/*
 * Each header spans its whole group and sticks within that span: the browser pins it to
 * the viewport top while its group is in view and slides it up and out as the group's
 * end (and with it the next header) arrives — frame-accurate without React re-renders.
 * Headers stay mounted outside the virtual window (one small node per date group) so a
 * pinned header never disappears mid-scroll. Positioned with `top`, not `translateY`:
 * WebKit computes sticky offsets ignoring ancestor transforms, which would pin every
 * header at the viewport top.
 */
function renderGroupHeader(row: VirtualGroupRow) {
  return (
    <div
      className="absolute left-0 w-full"
      key={row.key}
      style={{ height: row.end - row.start, top: row.start }}
    >
      {row.hasTopGap ? <div style={{ height: GROUP_GAP }} /> : null}
      <div className="sticky top-0 z-10" data-sticky-group>
        <SidebarGroup className="bg-sidebar px-2 py-0">
          <GroupLabel label={row.label} />
        </SidebarGroup>
      </div>
    </div>
  )
}

export function VirtualSessionList({
  focusNavigationRevision,
  focusedSessionId,
  selectedSessionId,
  sessionTimeline,
  viewport,
  onDeleteSession,
  onRenameSession,
  onSelectSession,
  onTogglePinSession,
}: {
  focusNavigationRevision: number
  focusedSessionId: string | null
  selectedSessionId: string | null
  sessionTimeline: SessionTimelineGroup[]
  viewport: HTMLDivElement | null
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onSelectSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const [enterListRevision, setEnterListRevision] = useState(0)
  // Arrow-key navigation (parent revision) and Tabbing into the list from the actions bar
  // (local revision) share one scroll-and-focus effect.
  const listFocusRevision = focusNavigationRevision + enterListRevision
  const lastFocusNavigationRevisionRef = useRef(listFocusRevision)
  const { groupRows, rows, sessionIndexes } = useMemo(
    () => createVirtualRows(sessionTimeline),
    [sessionTimeline],
  )
  const getScrollElement = useCallback(() => viewport, [viewport])
  const getItemKey = useCallback((index: number) => rows[index]?.key ?? index, [rows])
  const estimateSize = useCallback(
    (index: number) => {
      const row = rows[index]
      if (row?.type === 'group') return GROUP_HEIGHT + (row.hasTopGap ? GROUP_GAP : 0)
      return SESSION_HEIGHT
    },
    [rows],
  )
  // TanStack Virtual owns mutable scroll state, so React Compiler must leave this hook alone.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize,
    getItemKey,
    getScrollElement,
    overscan: 5,
    useFlushSync: false,
  })
  const focusedIndex = focusedSessionId ? sessionIndexes.get(focusedSessionId) : undefined
  const selectedRowIndex = selectedSessionId ? sessionIndexes.get(selectedSessionId) : undefined

  // Scrolling slides rows under a stationary pointer, so :hover would re-target every
  // session the pointer crosses. Freeze the hover highlight at gesture start (sessionId,
  // pinned onto its row as bg classes) and suppress row hit-testing (isScrolling, via
  // session-sidebar.css) until the scroll settles; :hover then resumes under the pointer.
  const [scrollHover, setScrollHover] = useState({
    isScrolling: false,
    sessionId: null as string | null,
  })
  const isListScrollingRef = useRef(false)

  useEffect(() => {
    if (!viewport) return
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    const handleScroll = () => {
      if (!isListScrollingRef.current) {
        isListScrollingRef.current = true
        setScrollHover({ isScrolling: true, sessionId: hoveredSessionId(viewport) })
      }
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => {
        isListScrollingRef.current = false
        setScrollHover({ isScrolling: false, sessionId: null })
      }, SCROLL_SETTLE_MS)
    }
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      viewport.removeEventListener('scroll', handleScroll)
      clearTimeout(settleTimer)
      if (isListScrollingRef.current) {
        isListScrollingRef.current = false
        setScrollHover({ isScrolling: false, sessionId: null })
      }
    }
  }, [viewport])

  const handleTabIntoSessions = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Tab' || event.shiftKey || focusedIndex === undefined) return
    event.preventDefault()
    setEnterListRevision((revision) => revision + 1)
  }

  const locateCurrentSession = () => {
    if (selectedRowIndex === undefined) return
    virtualizer.scrollToIndex(selectedRowIndex, { align: 'center', behavior: 'smooth' })
  }

  const scrollToTop = () => {
    viewport?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  useLayoutEffect(() => {
    if (!viewport) return
    const hasNavigationChanged = lastFocusNavigationRevisionRef.current !== listFocusRevision
    lastFocusNavigationRevisionRef.current = listFocusRevision
    if (!hasNavigationChanged || focusedIndex === undefined) return

    virtualizer.scrollToIndex(focusedIndex, { align: 'auto' })
  }, [listFocusRevision, focusedIndex, viewport, virtualizer])

  return (
    <div
      className="relative w-full"
      data-session-list-scrolling={scrollHover.isScrolling ? 'true' : undefined}
      style={{ height: virtualizer.getTotalSize() }}
    >
      <SessionListActions
        canLocateCurrent={selectedRowIndex !== undefined}
        onLocateCurrent={locateCurrentSession}
        onScrollToTop={scrollToTop}
        onTabIntoSessions={handleTabIntoSessions}
      />
      {groupRows.map(renderGroupHeader)}
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index]
        if (!row || row.type === 'group') return null

        return (
          <div
            className="absolute top-0 left-0 w-full"
            key={row.key}
            style={{
              height: virtualRow.size,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <SidebarMenu className="h-full gap-0.5 px-2 pb-0.5">
              <SessionItem
                activity={row.entry.activity}
                focusRequestRevision={
                  focusedSessionId === row.entry.session.id && listFocusRevision > 0
                    ? listFocusRevision
                    : undefined
                }
                isActive={selectedSessionId === row.entry.session.id}
                isFocused={focusedSessionId === row.entry.session.id}
                isHoverFrozen={scrollHover.sessionId === row.entry.session.id}
                isPinned={row.entry.isPinned}
                project={row.entry.project}
                projectLabel={row.entry.projectLabel}
                session={row.entry.session}
                onClick={() => onSelectSession(row.entry.session)}
                onDeleteSession={onDeleteSession}
                onRenameSession={onRenameSession}
                onTogglePinSession={onTogglePinSession}
              />
            </SidebarMenu>
          </div>
        )
      })}
    </div>
  )
}
