import { useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { SidebarRail, useSidebar } from '@/shadcn/sidebar'

import { useSidebarResize } from '../../../components/resizable-sidebar'

const KEYBOARD_RESIZE_STEP = 8

export function SidebarResizeHandle() {
  const { t } = useTranslation()
  const resizeContext = useSidebarResize()
  const canResize = resizeContext !== null
  const { isMobile, open, setOpen } = useSidebar()
  const finishResizeRef = useRef(resizeContext?.finishResize)
  const openRef = useRef(open)
  const pointerIdRef = useRef<number | null>(null)
  const pointerTargetRef = useRef<HTMLButtonElement | null>(null)
  const resizeRef = useRef(resizeContext?.resize)
  const setOpenRef = useRef(setOpen)

  useEffect(() => {
    finishResizeRef.current = resizeContext?.finishResize
    openRef.current = open
    resizeRef.current = resizeContext?.resize
    setOpenRef.current = setOpen
  }, [open, resizeContext, setOpen])

  const finishActiveResize = useCallback((pointerId?: number) => {
    const activePointerId = pointerIdRef.current
    if (activePointerId === null || (pointerId !== undefined && pointerId !== activePointerId)) {
      return
    }

    pointerIdRef.current = null
    const pointerTarget = pointerTargetRef.current
    pointerTargetRef.current = null
    try {
      if (pointerTarget?.hasPointerCapture?.(activePointerId)) {
        pointerTarget.releasePointerCapture(activePointerId)
      }
    } catch {
      // Pointer capture may already be gone after the window loses focus.
    }
    finishResizeRef.current?.()
  }, [])

  useEffect(() => {
    if (!canResize || isMobile) return

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerIdRef.current) return
      const shouldOpen = resizeRef.current?.(event.clientX)
      if (shouldOpen === undefined) return
      if (shouldOpen === openRef.current) return
      openRef.current = shouldOpen
      setOpenRef.current(shouldOpen)
    }
    const handlePointerEnd = (event: PointerEvent) => {
      finishActiveResize(event.pointerId)
    }
    const handleWindowBlur = () => finishActiveResize()

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    window.addEventListener('blur', handleWindowBlur)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
      window.removeEventListener('blur', handleWindowBlur)
      finishActiveResize()
    }
  }, [canResize, finishActiveResize, isMobile])

  if (isMobile) return null

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!resizeContext) return

    let nextWidth: number
    switch (event.key) {
      case 'ArrowLeft':
        nextWidth = resizeContext.width - KEYBOARD_RESIZE_STEP
        break
      case 'ArrowRight':
        nextWidth = resizeContext.width + KEYBOARD_RESIZE_STEP
        break
      case 'Home':
        nextWidth = resizeContext.minWidth
        break
      case 'End':
        nextWidth = resizeContext.maxWidth
        break
      default:
        return
    }

    event.preventDefault()
    resizeContext.resize(nextWidth)
    resizeContext.finishResize()
  }

  return (
    <SidebarRail
      aria-label={t('workbench.sidebar.resize')}
      aria-valuemax={resizeContext?.maxWidth}
      aria-valuemin={resizeContext?.minWidth}
      aria-valuenow={resizeContext?.width}
      aria-orientation="vertical"
      className="right-0! w-1.5! translate-x-1/2! touch-none outline-none after:hidden! focus-visible:after:block! focus-visible:after:bg-ring!"
      onClick={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
      onLostPointerCapture={(event) => finishActiveResize(event.pointerId)}
      onPointerDown={(event) => {
        if (!resizeContext || event.button !== 0) return
        event.preventDefault()
        finishActiveResize()
        pointerIdRef.current = event.pointerId
        pointerTargetRef.current = event.currentTarget
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch {
          // Window blur still finalizes the drag if capture is unavailable.
        }
        resizeContext.startResize()
      }}
      role="separator"
      tabIndex={0}
      title={undefined}
    />
  )
}
