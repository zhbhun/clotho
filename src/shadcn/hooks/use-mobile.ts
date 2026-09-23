import * as React from 'react'

/** Narrowest usable docked sidebar; the resizable sidebar clamps to it too. */
export const MIN_DOCKED_SIDEBAR_WIDTH = 256

// The docked sidebar may take at most a third of the window, so below three
// times its minimum width that share cannot fit the minimum anymore: the
// sidebar collapses into an overlay drawer instead of docking.
export const MOBILE_BREAKPOINT = MIN_DOCKED_SIDEBAR_WIDTH * 3

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
