import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import * as React from 'react'

import { DropdownMenuContent as ShadcnDropdownMenuContent } from '@/shadcn/dropdown-menu'

export {
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shadcn/dropdown-menu'

const CloseReasonContext = React.createContext<React.RefObject<string | null> | null>(null)

function DropdownMenu({ onOpenChange, ...props }: MenuPrimitive.Root.Props) {
  // Record the latest close reason for DropdownMenuContent's finalFocus decision:
  // outside presses leave focus on the clicked element (such as the conversation input),
  // while Escape and menu-item closes restore focus to the trigger.
  const closeReasonRef = React.useRef<string | null>(null)
  return (
    <CloseReasonContext.Provider value={closeReasonRef}>
      <MenuPrimitive.Root
        data-slot="dropdown-menu"
        onOpenChange={(open, eventDetails) => {
          closeReasonRef.current = open ? null : eventDetails.reason
          onOpenChange?.(open, eventDetails)
        }}
        {...props}
      />
    </CloseReasonContext.Provider>
  )
}

function DropdownMenuContent(props: React.ComponentProps<typeof ShadcnDropdownMenuContent>) {
  const closeReasonRef = React.useContext(CloseReasonContext)
  // Base UI only focuses the first item for keyboard-opened menus; a menu opened
  // by pointer stays unhighlighted. The popup remounts on every open, so focusing
  // the first enabled item here runs once per open with the items already present.
  const setPopup = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    queueMicrotask(() => {
      node
        .querySelector<HTMLElement>(
          '[role^="menuitem"]:not([data-disabled]):not([aria-disabled="true"])',
        )
        ?.focus({ preventScroll: true })
    })
  }, [])
  return (
    <ShadcnDropdownMenuContent
      ref={setPopup}
      finalFocus={
        closeReasonRef
          ? () => (closeReasonRef.current === 'outside-press' ? false : true)
          : undefined
      }
      {...props}
    />
  )
}

export { DropdownMenu, DropdownMenuContent }
