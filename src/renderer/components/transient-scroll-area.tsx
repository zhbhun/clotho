import type { BaseUIEvent } from '@base-ui/react/types'
import {
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react'

import { ScrollArea } from '@/shadcn/scroll-area'
import { cn } from '@/shadcn/utils'

import './transient-scroll-area.css'
import {
  SCROLLBAR_SELECTOR,
  useTransientScrollbarVisibility,
} from './use-transient-scrollbar-visibility'

const SIDEBAR_LAYOUT_SELECTOR = '.session-sidebar-layout'
const sidebarLayoutDragCounts = new WeakMap<HTMLElement, number>()
let bodySelectionLockCount = 0
let bodyUserSelectBeforeDrag = ''
let bodyWebkitUserSelectBeforeDrag = ''

type TransientScrollAreaProps = ComponentProps<typeof ScrollArea>

type ScrollbarDrag = {
  handlePointerEnd: (event: PointerEvent) => void
  handleWindowBlur: () => void
  pointerId: number
  releaseBodySelection: () => void
  releaseLayoutDrag: () => void
  root: HTMLElement
}

function acquireBodySelectionLock() {
  if (bodySelectionLockCount === 0) {
    bodyUserSelectBeforeDrag = document.body.style.userSelect
    bodyWebkitUserSelectBeforeDrag = document.body.style.webkitUserSelect
    document.body.dataset.transientScrollbarDragging = 'true'
    document.body.style.userSelect = 'none'
    document.body.style.webkitUserSelect = 'none'
  }
  bodySelectionLockCount += 1

  let isReleased = false
  return () => {
    if (isReleased) return
    isReleased = true
    bodySelectionLockCount -= 1
    if (bodySelectionLockCount > 0) return

    delete document.body.dataset.transientScrollbarDragging
    document.body.style.userSelect = bodyUserSelectBeforeDrag
    document.body.style.webkitUserSelect = bodyWebkitUserSelectBeforeDrag
    bodyUserSelectBeforeDrag = ''
    bodyWebkitUserSelectBeforeDrag = ''
  }
}

function acquireLayoutDragLock(layout: HTMLElement | null) {
  if (!layout) return () => {}

  sidebarLayoutDragCounts.set(layout, (sidebarLayoutDragCounts.get(layout) ?? 0) + 1)
  layout.dataset.transientScrollbarDragging = 'true'

  let isReleased = false
  return () => {
    if (isReleased) return
    isReleased = true
    const nextCount = (sidebarLayoutDragCounts.get(layout) ?? 1) - 1
    if (nextCount > 0) {
      sidebarLayoutDragCounts.set(layout, nextCount)
      return
    }

    sidebarLayoutDragCounts.delete(layout)
    layout.removeAttribute('data-transient-scrollbar-dragging')
  }
}

export function TransientScrollArea({
  className,
  onPointerDownCapture,
  orientation = 'vertical',
  ...props
}: TransientScrollAreaProps) {
  const scrollbarDragRef = useRef<ScrollbarDrag | null>(null)
  const finishScrollbarDrag = useCallback((pointerId?: number) => {
    const drag = scrollbarDragRef.current
    if (!drag || (pointerId !== undefined && pointerId !== drag.pointerId)) return

    scrollbarDragRef.current = null
    window.removeEventListener('pointerup', drag.handlePointerEnd)
    window.removeEventListener('pointercancel', drag.handlePointerEnd)
    window.removeEventListener('blur', drag.handleWindowBlur)
    drag.root.removeAttribute('data-transient-scrollbar-dragging')
    drag.releaseBodySelection()
    drag.releaseLayoutDrag()
  }, [])

  useEffect(() => () => finishScrollbarDrag(), [finishScrollbarDrag])

  const rootRef = useRef<HTMLDivElement>(null)
  useTransientScrollbarVisibility(rootRef, orientation === 'horizontal')

  const handlePointerDownCapture = (event: BaseUIEvent<ReactPointerEvent<HTMLDivElement>>) => {
    onPointerDownCapture?.(event)
    if (event.defaultPrevented || event.button !== 0) return

    const target = event.target
    if (!(target instanceof Element)) return
    const scrollbar = target.closest(SCROLLBAR_SELECTOR)
    if (scrollbar?.closest('[data-transient-scroll-area]') !== event.currentTarget) return

    finishScrollbarDrag()
    const root = event.currentTarget
    const layout = root.closest<HTMLElement>(SIDEBAR_LAYOUT_SELECTOR)
    const handlePointerEnd = (pointerEvent: PointerEvent) =>
      finishScrollbarDrag(pointerEvent.pointerId)
    const handleWindowBlur = () => finishScrollbarDrag()
    scrollbarDragRef.current = {
      handlePointerEnd,
      handleWindowBlur,
      pointerId: event.pointerId,
      releaseBodySelection: acquireBodySelectionLock(),
      releaseLayoutDrag: acquireLayoutDragLock(layout),
      root,
    }
    root.dataset.transientScrollbarDragging = 'true'
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    window.addEventListener('blur', handleWindowBlur)
  }

  return (
    <ScrollArea
      {...props}
      className={cn('transient-scroll-area', className)}
      data-transient-scroll-area
      orientation={orientation}
      ref={rootRef}
      onPointerDownCapture={handlePointerDownCapture}
    />
  )
}
