import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { SidebarGroup, SidebarGroupLabel, SidebarMenu } from '@/shadcn/sidebar'

import type { WorkbenchSession } from '../stores/workbench-store'
import type { SessionTimelineGroup } from '../utils/session-list'
import { SessionItem } from './session-item'
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
 * Group labels are plain virtualized rows: they scroll away with their group (no
 * sticky pinning — the fixed tabs bar above the list owns the top edge). Positioned
 * with `transform`, like the session rows.
 */
function renderGroupRow(row: VirtualGroupRow, virtualRow: { size: number; start: number }) {
  return (
    <div
      className="absolute left-0 top-0 w-full"
      key={row.key}
      style={{
        height: virtualRow.size,
        transform: `translateY(${virtualRow.start}px)`,
      }}
    >
      {row.hasTopGap ? <div style={{ height: GROUP_GAP }} /> : null}
      <SidebarGroup className="px-2 py-0">
        <GroupLabel label={row.label} />
      </SidebarGroup>
    </div>
  )
}

export function VirtualSessionList({
  enterListRevision,
  focusNavigationRevision,
  focusedSessionId,
  locateRequestRevision,
  selectedSessionId,
  sessionTimeline,
  viewport,
  onDeleteSession,
  onRenameSession,
  onSelectSession,
  onTogglePinSession,
}: {
  enterListRevision: number
  focusNavigationRevision: number
  focusedSessionId: string | null
  locateRequestRevision: number
  selectedSessionId: string | null
  sessionTimeline: SessionTimelineGroup[]
  viewport: HTMLDivElement | null
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onSelectSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  // Arrow-key navigation (parent revision) and Tabbing into the list from the tabs bar
  // (local revision) share one scroll-and-focus effect.
  const listFocusRevision = focusNavigationRevision + enterListRevision
  const lastFocusNavigationRevisionRef = useRef(listFocusRevision)
  const { rows, sessionIndexes } = useMemo(
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

  // Locate lives in the fixed tabs bar; its click reaches the virtualizer as a revision.
  const lastLocateRequestRevisionRef = useRef(locateRequestRevision)
  useLayoutEffect(() => {
    if (lastLocateRequestRevisionRef.current === locateRequestRevision) return
    lastLocateRequestRevisionRef.current = locateRequestRevision
    if (selectedRowIndex === undefined) return
    virtualizer.scrollToIndex(selectedRowIndex, { align: 'center', behavior: 'smooth' })
  }, [locateRequestRevision, selectedRowIndex, virtualizer])

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
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const row = rows[virtualRow.index]
        if (!row) return null
        if (row.type === 'group') return renderGroupRow(row, virtualRow)

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
