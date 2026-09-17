import {
  type CSSProperties,
  type ComponentProps,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'

import { SidebarProvider } from '@/shadcn/sidebar'

import { readUiState, updateUiState } from '../services/ui-storage'
import { APP_SIDEBAR_DEFAULT_WIDTH } from './app-layout'

const MIN_SIDEBAR_WIDTH = 256
const MAX_SIDEBAR_WIDTH = 400
const SIDEBAR_COLLAPSE_THRESHOLD = MIN_SIDEBAR_WIDTH / 2

type SidebarResizeContextValue = {
  finishResize: () => void
  maxWidth: number
  minWidth: number
  resize: (pointerX: number) => boolean
  startResize: () => void
  width: number
}

const SidebarResizeContext = createContext<SidebarResizeContextValue | null>(null)

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width))
}

function loadSidebarWidth() {
  const width = readUiState().sidebarWidth
  return typeof width === 'number' ? clampSidebarWidth(width) : APP_SIDEBAR_DEFAULT_WIDTH
}

export function ResizableSidebarProvider({
  style,
  ...props
}: ComponentProps<typeof SidebarProvider>) {
  const [width, setWidth] = useState(loadSidebarWidth)
  const [isResizing, setIsResizing] = useState(false)
  const widthRef = useRef(width)
  const resize = useCallback((pointerX: number) => {
    const nextWidth = clampSidebarWidth(pointerX)
    widthRef.current = nextWidth
    setWidth(nextWidth)
    return pointerX >= SIDEBAR_COLLAPSE_THRESHOLD
  }, [])
  const startResize = useCallback(() => setIsResizing(true), [])
  const finishResize = useCallback(() => {
    setIsResizing(false)
    updateUiState({ sidebarWidth: widthRef.current })
  }, [])
  const contextValue = useMemo(
    () => ({
      finishResize,
      maxWidth: MAX_SIDEBAR_WIDTH,
      minWidth: MIN_SIDEBAR_WIDTH,
      resize,
      startResize,
      width,
    }),
    [finishResize, resize, startResize, width],
  )

  return (
    <SidebarResizeContext.Provider value={contextValue}>
      <SidebarProvider
        {...props}
        data-sidebar-resizing={isResizing ? 'true' : undefined}
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
