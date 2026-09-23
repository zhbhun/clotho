import {
  type CSSProperties,
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { MIN_DOCKED_SIDEBAR_WIDTH } from '@/shadcn/hooks/use-mobile'
import { SidebarProvider } from '@/shadcn/sidebar'

import { readUiState, updateUiState } from '../services/ui-storage'
import { APP_SIDEBAR_DEFAULT_WIDTH } from './app-layout'

const MAX_SIDEBAR_WIDTH = 400
const MIN_SIDEBAR_WIDTH = MIN_DOCKED_SIDEBAR_WIDTH
const SIDEBAR_COLLAPSE_THRESHOLD = MIN_SIDEBAR_WIDTH / 2
// Continuous window drags fire resize every frame; the flag stays up this long
// after the last event so width follows the pointer immediately (no transition)
// while click-triggered collapse/expand after settling still animates.
const WINDOW_RESIZE_SETTLE_MS = 150

type SidebarResizeContextValue = {
  finishResize: () => void
  maxWidth: number
  minWidth: number
  resize: (pointerX: number) => boolean
  startResize: () => void
  width: number
}

const SidebarResizeContext = createContext<SidebarResizeContextValue | null>(null)

function clampSidebarWidth(width: number, maxWidth: number) {
  return Math.min(maxWidth, Math.max(MIN_SIDEBAR_WIDTH, width))
}

function loadSidebarWidth() {
  const width = readUiState().sidebarWidth
  return typeof width === 'number'
    ? clampSidebarWidth(width, MAX_SIDEBAR_WIDTH)
    : APP_SIDEBAR_DEFAULT_WIDTH
}

export function ResizableSidebarProvider({
  style,
  ...props
}: ComponentProps<typeof SidebarProvider>) {
  // The user's preferred width persists untouched by window resizes; the
  // rendered width is the preference clamped to the current window, so a
  // narrow window compresses the sidebar and a wider one restores it.
  const [preferredWidth, setPreferredWidth] = useState(loadSidebarWidth)
  const [isResizing, setIsResizing] = useState(false)
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  const [isWindowResizing, setIsWindowResizing] = useState(false)
  const widthRef = useRef(preferredWidth)
  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    const handleWindowResize = () => {
      setWindowWidth(window.innerWidth)
      setIsWindowResizing(true)
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => setIsWindowResizing(false), WINDOW_RESIZE_SETTLE_MS)
    }
    window.addEventListener('resize', handleWindowResize)
    return () => {
      window.removeEventListener('resize', handleWindowResize)
      clearTimeout(settleTimer)
    }
  }, [])
  const maxWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.floor(windowWidth / 3))
  const width = clampSidebarWidth(preferredWidth, maxWidth)
  const resize = useCallback(
    (pointerX: number) => {
      const nextWidth = clampSidebarWidth(pointerX, maxWidth)
      widthRef.current = nextWidth
      setPreferredWidth(nextWidth)
      return pointerX >= SIDEBAR_COLLAPSE_THRESHOLD
    },
    [maxWidth],
  )
  const startResize = useCallback(() => setIsResizing(true), [])
  const finishResize = useCallback(() => {
    setIsResizing(false)
    updateUiState({ sidebarWidth: widthRef.current })
  }, [])
  const contextValue = useMemo(
    () => ({
      finishResize,
      maxWidth,
      minWidth: MIN_SIDEBAR_WIDTH,
      resize,
      startResize,
      width,
    }),
    [finishResize, maxWidth, resize, startResize, width],
  )

  return (
    <SidebarResizeContext.Provider value={contextValue}>
      <SidebarProvider
        {...props}
        data-sidebar-resizing={isResizing ? 'true' : undefined}
        data-window-resizing={isWindowResizing ? 'true' : undefined}
        style={
          {
            ...style,
            '--sidebar-width': `${width}px`,
          } as CSSProperties
        }
      />
    </SidebarResizeContext.Provider>
  )
}

export function useSidebarResize() {
  return useContext(SidebarResizeContext)
}
