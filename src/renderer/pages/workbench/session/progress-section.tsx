import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const CLOSE_GRACE_MS = 120

/**
 * Panel section trigger: hovering expands a popover rendered through a portal to body to avoid
 * outer overflow clipping. Chrome (border, background) comes from the surrounding panel.
 */
export function ProgressSection({
  children,
  icon,
  popover,
}: {
  children: ReactNode
  icon: ReactNode
  popover: ReactNode
}) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null)

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const show = () => {
    cancelClose()
    setOpen(true)
  }
  const scheduleHide = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_GRACE_MS)
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const box = triggerRef.current.getBoundingClientRect()
    setRect({ left: box.left, top: box.top, width: box.width })
  }, [open])

  useLayoutEffect(() => () => cancelClose(), [])

  return (
    <>
      <div
        ref={triggerRef}
        className="flex items-center gap-2 px-2 py-0.5 transition-colors hover:text-foreground"
        onMouseEnter={show}
        onMouseLeave={scheduleHide}
      >
        {icon}
        {children}
      </div>

      {open && rect
        ? createPortal(
            <div
              className="fixed z-50 w-[min(420px,90vw)] -translate-x-1/2 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-popover"
              data-glass="true"
              style={{
                left: rect.left + rect.width / 2,
                bottom: window.innerHeight - rect.top + 6,
              }}
              onMouseEnter={show}
              onMouseLeave={scheduleHide}
            >
              {popover}
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
