import { useVirtualizer } from '@tanstack/react-virtual'
import { defaultRangeExtractor } from '@tanstack/virtual-core'
import {
  type ForwardedRef,
  type ReactElement,
  type ReactNode,
  type RefAttributes,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'

export interface VirtualConversationItem {
  key: string
  turnId?: string
}

export interface ConversationScrollAnchor {
  offset: number
  rowKey: string
}

export interface VirtualConversationHandle {
  captureScrollAnchor: () => ConversationScrollAnchor | null
  restoreScrollAnchor: (anchor: ConversationScrollAnchor) => boolean
  scrollToTurn: (turnId: string, behavior: ScrollBehavior) => void
}

type VirtualConversationListProps<Row extends VirtualConversationItem> = {
  estimateSize: (row: Row) => number
  onTotalSizeChange?: (size: number) => void
  onVisibleTurnIdsChange?: (ids: Set<string>) => void
  rows: Row[]
  scrollMargin?: number
  viewport: HTMLElement | null
  viewKey: string
  renderRow: (row: Row) => ReactNode
}

function VirtualConversationListInner<Row extends VirtualConversationItem>(
  {
    estimateSize,
    onTotalSizeChange,
    onVisibleTurnIdsChange,
    rows,
    scrollMargin = 0,
    viewport,
    viewKey,
    renderRow,
  }: VirtualConversationListProps<Row>,
  ref: ForwardedRef<VirtualConversationHandle>,
) {
  const [retainedKeys, setRetainedKeys] = useState<Set<string>>(() => new Set())
  const rowIndexes = useMemo(() => new Map(rows.map((row, index) => [row.key, index])), [rows])
  const getScrollElement = useCallback(() => viewport, [viewport])
  const getItemKey = useCallback((index: number) => rows[index]?.key ?? index, [rows])
  const estimateItemSize = useCallback(
    (index: number) => {
      const row = rows[index]
      return row ? estimateSize(row) : 80
    },
    [estimateSize, rows],
  )
  const rangeExtractor = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const indexes = new Set(defaultRangeExtractor(range))
      for (const key of retainedKeys) {
        const index = rowIndexes.get(key)
        if (index !== undefined) indexes.add(index)
      }
      return [...indexes].sort((left, right) => left - right)
    },
    [retainedKeys, rowIndexes],
  )
  // TanStack Virtual owns mutable scroll state, so React Compiler must leave this hook alone.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    directDomUpdates: true,
    estimateSize: estimateItemSize,
    getItemKey,
    getScrollElement,
    overscan: 6,
    rangeExtractor,
    scrollMargin,
    useFlushSync: false,
  })
  const firstIndexByTurnId = useMemo(() => {
    const indexes = new Map<string, number>()
    rows.forEach((row, index) => {
      if (row.turnId && !indexes.has(row.turnId)) indexes.set(row.turnId, index)
    })
    return indexes
  }, [rows])

  useImperativeHandle(
    ref,
    () => ({
      captureScrollAnchor() {
        if (!rows.length) return null
        const scrollOffset = viewport?.scrollTop ?? virtualizer.scrollOffset ?? 0
        const item = virtualizer.getVirtualItemForOffset(scrollOffset)
        const row = item ? rows[item.index] : undefined
        return row && item ? { offset: scrollOffset - item.start, rowKey: row.key } : null
      },
      restoreScrollAnchor(anchor) {
        const index = rowIndexes.get(anchor.rowKey)
        if (index === undefined) return false
        const offset = virtualizer.getOffsetForIndex(index, 'start')?.[0]
        if (offset === undefined) return false
        virtualizer.scrollToOffset(offset + anchor.offset, { behavior: 'auto' })
        return true
      },
      scrollToTurn(turnId, behavior) {
        const index = firstIndexByTurnId.get(turnId)
        if (index === undefined) return
        virtualizer.scrollToIndex(index, { align: 'start', behavior })
      },
    }),
    [firstIndexByTurnId, rowIndexes, rows, viewport, virtualizer],
  )

  useEffect(() => {
    setRetainedKeys(new Set())
  }, [viewKey])

  const retainRow = useCallback((key: string) => {
    setRetainedKeys((current) => {
      if (current.has(key)) return current
      const next = new Set(current)
      next.add(key)
      return next
    })
  }, [])

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()
  const visibleTurnIds = useMemo(() => {
    const start = virtualizer.scrollOffset ?? 0
    const end = start + (virtualizer.scrollRect?.height ?? viewport?.clientHeight ?? 0)
    const ids = new Set<string>()
    for (const item of virtualItems) {
      const row = rows[item.index]
      if (row?.turnId && item.end > start && item.start < end) ids.add(row.turnId)
    }
    return ids
  }, [rows, viewport, virtualItems, virtualizer.scrollOffset, virtualizer.scrollRect?.height])
  const visibleTurnIdsKey = [...visibleTurnIds].sort().join('\u0000')

  useEffect(() => {
    onTotalSizeChange?.(totalSize)
  }, [onTotalSizeChange, totalSize])

  useEffect(() => {
    onVisibleTurnIdsChange?.(new Set(visibleTurnIdsKey ? visibleTurnIdsKey.split('\u0000') : []))
  }, [onVisibleTurnIdsChange, visibleTurnIdsKey])

  if (viewport && viewport.clientHeight <= 0) {
    return (
      <div className="flex w-full flex-col">
        {rows.map((row) => (
          <div
            data-conversation-virtual-row={row.key}
            key={row.key}
            onFocusCapture={() => retainRow(row.key)}
            onKeyDownCapture={() => retainRow(row.key)}
            onPointerDownCapture={() => retainRow(row.key)}
          >
            {renderRow(row)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="relative w-full" ref={virtualizer.containerRef}>
      {virtualItems.map((virtualRow) => {
        const row = rows[virtualRow.index]
        if (!row) return null

        return (
          <div
            className="absolute top-0 left-0 w-full"
            data-conversation-virtual-row={row.key}
            data-index={virtualRow.index}
            key={row.key}
            ref={virtualizer.measureElement}
            onFocusCapture={() => retainRow(row.key)}
            onKeyDownCapture={() => retainRow(row.key)}
            onPointerDownCapture={() => retainRow(row.key)}
          >
            {renderRow(row)}
          </div>
        )
      })}
    </div>
  )
}

export const VirtualConversationList = forwardRef(VirtualConversationListInner) as <
  Row extends VirtualConversationItem,
>(
  props: VirtualConversationListProps<Row> & RefAttributes<VirtualConversationHandle>,
) => ReactElement
