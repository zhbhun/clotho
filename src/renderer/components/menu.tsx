import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import * as React from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/shadcn/command'
import { cn } from '@/shadcn/utils'

type OpenChangeDetails = Parameters<NonNullable<PopoverPrimitive.Root.Props['onOpenChange']>>[1]

const CloseContext = React.createContext<(() => void) | null>(null)

type MenuHighlightState = {
  activeValue: string | null
  setActiveValue: (value: string | null) => void
  initActiveValue: (value: string) => void
}

const HighlightContext = React.createContext<MenuHighlightState | null>(null)

type MenuProps = Omit<PopoverPrimitive.Root.Props, 'open' | 'onOpenChange'> & {
  open?: boolean
  onOpenChange?: (open: boolean, eventDetails: OpenChangeDetails) => void
}

/**
 * Searchable dropdown menu built from Popover + Command.
 * Supports controlled and uncontrolled open state and closes after selecting a MenuItem.
 * Omit MenuSearch to use a plain menu.
 */
function Menu({ open: openProp, onOpenChange, defaultOpen, ...props }: MenuProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const isControlled = openProp !== undefined
  const open = isControlled ? openProp : internalOpen

  // The highlight (cmdk active value) lives here, outside the popup, because the
  // popup can stay mounted through its exit transition: dropping the remembered
  // value on close makes every open restart the highlight from the selected item.
  const [activeValue, setActiveValue] = React.useState<string | null>(null)
  React.useLayoutEffect(() => {
    if (!open) setActiveValue(null)
  }, [open])

  const setOpen = (next: boolean, eventDetails: OpenChangeDetails) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next, eventDetails)
  }

  // Selecting an item is a close source outside Popover; the synthetic event only carries the reason.
  const close = () => setOpen(false, { reason: 'item-select' } as unknown as OpenChangeDetails)

  const initActiveValue = React.useCallback((value: string) => {
    setActiveValue((prev) => (prev === null ? value : prev))
  }, [])

  const highlight = React.useMemo(
    () => ({ activeValue, setActiveValue, initActiveValue }),
    [activeValue, initActiveValue],
  )

  return (
    <HighlightContext.Provider value={highlight}>
      <CloseContext.Provider value={close}>
        <PopoverPrimitive.Root data-slot="menu" open={open} onOpenChange={setOpen} {...props} />
      </CloseContext.Provider>
    </HighlightContext.Provider>
  )
}

function MenuTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuSearch({ inputGroupClassName, ...props }: React.ComponentProps<typeof CommandInput>) {
  return (
    <CommandInput
      inputGroupClassName={cn('rounded-none border-0 bg-transparent!', inputGroupClassName)}
      {...props}
    />
  )
}

function MenuContent({
  align = 'start',
  alignOffset = 0,
  glass = false,
  side = 'bottom',
  sideOffset = 4,
  className,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    glass?: boolean
  }) {
  // On open, place the keyboard highlight on the selected item; cmdk owns highlight
  // updates afterward (hover and arrow keys). The state lives in Menu so closing
  // drops it and every open restarts from the selected item.
  const highlight = React.useContext(HighlightContext)
  const contentId = React.useId()

  // Without a search input the popup has no tabbable child, so Base UI's default initial focus
  // lands on the popup element itself and cmdk's root never sees the arrow keys. Point the
  // initial focus at the cmdk root for plain menus; search menus keep focusing the input.
  // The callback runs on every open, when the popup content is mounted.
  const commandRef = React.useRef<HTMLDivElement | null>(null)
  const resolveInitialFocus = React.useCallback(() => {
    const root = commandRef.current
    if (!root || root.querySelector('[cmdk-input]')) return true
    return root
  }, [])

  // Scroll only for initial positioning on open and keyboard navigation.
  // cmdk uses the same highlight path for hover and keyboard input, so mutation alone cannot tell them apart.
  // Record keyboard "scroll intent" and scroll only for intentional or initial highlight changes.
  // When moving upward onto a group header, scroll the header; when moving downward, scroll the item itself.
  // cmdk may query before the new highlight reaches the DOM and scroll the old item; this corrects that behavior.
  React.useEffect(() => {
    if (typeof MutationObserver === 'undefined') return
    let pendingDirection: 'up' | 'down' | null = null
    let needInitialScroll = true
    let pendingTimer: ReturnType<typeof setTimeout> | undefined

    const scrollToHighlightedItem = (direction: 'up' | 'down' | null) => {
      const item = document
        .getElementById(contentId)
        ?.querySelector("[data-slot='command-item'][aria-selected='true']")
      if (!item) return
      const heading = item.previousElementSibling?.matches("[data-slot='menu-label']")
        ? item.previousElementSibling
        : null
      if (direction === 'up' && heading) {
        heading.scrollIntoView({ block: 'nearest' })
      } else {
        item.scrollIntoView({ block: 'nearest' })
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'ArrowUp' &&
        event.key !== 'ArrowDown' &&
        event.key !== 'Home' &&
        event.key !== 'End'
      ) {
        return
      }
      const root = document.getElementById(contentId)
      if (!root || !(event.target instanceof Node) || !root.contains(event.target)) return
      pendingDirection = event.key === 'ArrowUp' || event.key === 'Home' ? 'up' : 'down'
      clearTimeout(pendingTimer)
      pendingTimer = setTimeout(() => {
        pendingDirection = null
      }, 500)
    }
    document.addEventListener('keydown', onKeyDown)

    const onMutate = () => {
      if (needInitialScroll) {
        needInitialScroll = false
        scrollToHighlightedItem(null)
        return
      }
      if (pendingDirection) {
        const direction = pendingDirection
        pendingDirection = null
        scrollToHighlightedItem(direction)
      }
    }
    const observer = new MutationObserver(onMutate)
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['aria-selected'],
    })
    return () => {
      observer.disconnect()
      document.removeEventListener('keydown', onKeyDown)
      clearTimeout(pendingTimer)
    }
  }, [contentId])

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="menu-content"
          initialFocus={resolveInitialFocus}
          data-glass={glass ? 'true' : undefined}
          className={cn(
            'z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 origin-(--transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-popover ring-1 ring-foreground/10 duration-100 outline-none data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {/* The contents container creates no box; it is only an anchor for scroll observation. */}
          <div className="contents" id={contentId}>
            <Command
              ref={commandRef}
              className="gap-0 rounded-none bg-transparent p-0"
              value={highlight?.activeValue ?? undefined}
              onValueChange={highlight?.setActiveValue}
            >
              {children}
            </Command>
          </div>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function MenuLabel({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="menu-label"
      className={cn('px-2 py-1.5 text-xs text-muted-foreground', className)}
      {...props}
    />
  )
}

function MenuItem({
  selected,
  onSelect,
  ...props
}: React.ComponentProps<typeof CommandItem> & {
  selected?: boolean
}) {
  const close = React.useContext(CloseContext)
  const highlight = React.useContext(HighlightContext)
  const initActiveValue = highlight?.initActiveValue
  const itemRef = React.useRef<HTMLDivElement | null>(null)

  // Report the selected item's cmdk value on open (cmdk writes data-value in its own layout
  // effect). Depending on activeValue re-runs the report when Menu drops the value on close,
  // which re-anchors the highlight even when the popup never unmounted.
  React.useLayoutEffect(() => {
    if (!selected || !initActiveValue) return
    const value = itemRef.current?.getAttribute('data-value')
    if (value !== null && value !== undefined) initActiveValue(value)
  }, [selected, initActiveValue, highlight?.activeValue])

  return (
    <CommandItem
      ref={itemRef}
      data-checked={selected ? 'true' : undefined}
      onSelect={(value) => {
        onSelect?.(value)
        close?.()
      }}
      {...props}
    />
  )
}

/**
 * Use MenuLabel instead of cmdk's native heading for group headers:
 * cmdk forces a heading into view when keyboard navigation reaches the first item in a group.
 * A custom header avoids that behavior; when there are no matches, cmdk still hides the whole group.
 */
function MenuGroup({
  heading,
  children,
  className,
  ...props
}: React.ComponentProps<typeof CommandGroup>) {
  // Collapse the group's own vertical padding; the heading's padding alone
  // carries the spacing so gaps stay even above and below group headings.
  return (
    <CommandGroup className={cn('px-0 py-0', className)} {...props}>
      {heading ? <MenuLabel>{heading}</MenuLabel> : null}
      {children}
    </CommandGroup>
  )
}

export { Menu, MenuTrigger, MenuContent, MenuItem, MenuLabel, MenuGroup, MenuSearch }

export { CommandEmpty as MenuEmpty, CommandList as MenuList, CommandSeparator as MenuSeparator }
