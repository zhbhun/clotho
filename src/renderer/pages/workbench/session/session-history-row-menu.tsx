import { Ellipsis, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  type MenuOpenChangeDetails,
  MenuSeparator,
  MenuTrigger,
} from '../../../components/menu'
import type { WorkbenchSession } from '../stores/workbench-store'

/** Hover intent delay before the row menu opens, so brushing past rows does not pop menus. */
const OPEN_DELAY_MS = 100
/** Grace period after hover-out before the menu closes, so the pointer can travel into the popup. */
const CLOSE_DELAY_MS = 150

/** "..." menu on a history row offering pin, rename, and delete. Opens on hover
    and keeps the parent history menu open while its actions run. */
export function SessionHistoryRowMenu({
  isPinned,
  session,
  onDeleteSession,
  onRenameSession,
  onTogglePinSession,
}: {
  isPinned: boolean
  session: WorkbenchSession
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const openTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const clearTimers = () => {
    clearTimeout(openTimer.current)
    clearTimeout(closeTimer.current)
  }
  const openOnHover = () => {
    clearTimers()
    openTimer.current = setTimeout(() => setOpen(true), OPEN_DELAY_MS)
  }
  const closeOnHoverOut = () => {
    clearTimers()
    closeTimer.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }
  const handleOpenChange = (next: boolean, details: MenuOpenChangeDetails) => {
    clearTimers()
    // Hover already opened the menu; the press that follows must not toggle it shut.
    if (!next && details.reason === 'trigger-press') return
    setOpen(next)
  }

  // The popup does not follow the row when the history list scrolls; close it
  // instead of letting it drift. Scrolls inside the popup itself are kept.
  useEffect(() => {
    if (!open) return
    const onScroll = (event: Event) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-session-history-row-menu]')) return
      setOpen(false)
    }
    document.addEventListener('scroll', onScroll, true)
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [open])

  useEffect(
    () => () => {
      clearTimeout(openTimer.current)
      clearTimeout(closeTimer.current)
    },
    [],
  )

  return (
    <Menu open={open} onOpenChange={handleOpenChange}>
      <MenuTrigger
        render={
          <button
            type="button"
            aria-label={t('workbench.action.more')}
            className="flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground-subtlest opacity-0 group-hover/command-item:opacity-100 hover:bg-foreground/10 hover:text-foreground data-popup-open:opacity-100"
            onClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerEnter={openOnHover}
            onPointerLeave={closeOnHoverOut}
          >
            <Ellipsis className="size-3.5" strokeWidth={1.5} />
          </button>
        }
      />
      <MenuContent
        align="end"
        aria-label={t('workbench.action.more')}
        className="w-36"
        data-session-history-row-menu=""
        glass
        side="bottom"
        sideOffset={2}
        // The popup portals out of the row, but React events still bubble along
        // the React tree: without these stops a press on a row-menu item would
        // also select the history row underneath it.
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerEnter={clearTimers}
        onPointerLeave={closeOnHoverOut}
      >
        <MenuGroup>
          <MenuItem value="pin" onSelect={() => onTogglePinSession(session)}>
            {isPinned ? <PinOff strokeWidth={1.5} /> : <Pin strokeWidth={1.5} />}
            {isPinned ? t('workbench.action.unpin') : t('workbench.action.pin')}
          </MenuItem>
          <MenuItem value="rename" onSelect={() => onRenameSession(session)}>
            <Pencil strokeWidth={1.5} />
            {t('workbench.action.rename')}
          </MenuItem>
        </MenuGroup>
        <MenuSeparator />
        <MenuGroup>
          <MenuItem
            className="text-destructive data-selected:bg-destructive/10 data-selected:text-destructive"
            value="delete"
            onSelect={() => onDeleteSession(session)}
          >
            <Trash2 strokeWidth={1.5} />
            {t('workbench.action.delete')}
          </MenuItem>
        </MenuGroup>
      </MenuContent>
    </Menu>
  )
}
