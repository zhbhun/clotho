import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function MarketplaceToolbar({
  target,
  children,
}: {
  target?: HTMLElement | null
  children: ReactNode
}) {
  if (target === undefined)
    return <div className="flex items-center justify-end gap-4">{children}</div>
  return target && createPortal(children, target)
}
