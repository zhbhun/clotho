import { CheckIcon, ChevronDownIcon, DownloadIcon, XIcon } from 'lucide-react'
import { type RefObject, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shadcn/dialog'
import { cn } from '@/shadcn/utils'

import { claude } from '../../../../services/claude/claude'
import { isDesktopRuntime } from '../../../../services/desktop/client'

type ImageSize = { width: number; height: number }
type Zoom = 'fit' | number

const ZOOM_LEVELS: number[] = [0.25, 0.5, 1, 1.5, 2]
const MIN_ZOOM = 0.1
const MAX_ZOOM = 4
// Pinch deltas feed an exponential curve; 0.01 keeps a natural pace per wheel tick.
const PINCH_ZOOM_SPEED = 0.01

// The canvas padding doubles as the whitespace revealed when a zoomed image is scrolled to its
// edges; the fit scale subtracts it so a fitted image never slides under the floating toolbar.
const CANVAS_PADDING = 48

const ZOOM_ROW =
  'flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs/relaxed whitespace-nowrap outline-none hover:bg-accent'

function formatZoom(scale: number) {
  return `${Math.round(scale * 100)}%`
}

// Fullscreen viewer for attachment thumbnails: a frosted-glass takeover with a floating toolbar
// (zoom, download, close) and a scrollable canvas. The zoom panel renders inline inside the
// popup on purpose — a portaled menu over a fullscreen dialog relies on too many compositor
// stacking details. Zoom-to-fit is measured from the viewport (the canvas is exactly the
// viewport by construction), fixed levels render at natural-size multiples, and the image
// keeps a padded margin when scrolled to its extremes.
export function ImagePreview({
  alt,
  onOpenChange,
  open,
  returnFocusRef,
  src,
}: {
  alt: string
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef?: RefObject<HTMLElement | null>
  src: string
}) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [isZoomOpen, setIsZoomOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [canvasSize, setCanvasSize] = useState<ImageSize>()
  const [naturalSize, setNaturalSize] = useState<ImageSize>()
  const canvasRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const pinchAnchorRef = useRef<{ scale: number; x: number; y: number } | undefined>(undefined)
  const viewRef = useRef({ fitScale: 1, scale: 1 })

  useEffect(() => {
    if (open) {
      setZoom('fit')
      setIsZoomOpen(false)
      pinchAnchorRef.current = undefined
    }
  }, [open])

  useEffect(() => {
    // Synchronous first read keeps the initial fit deterministic; Electron's async
    // ResizeObserver callbacks left the fit fallback in place on the real first paint.
    if (!open) return
    const update = () => setCanvasSize({ width: window.innerWidth, height: window.innerHeight })
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [open])

  // Trackpad pinch arrives as ctrl+wheel; a non-passive listener lets preventDefault stop
  // Chromium's page-level zoom so the gesture drives the image only. Attached through the
  // ref callback because Base UI mounts the popup after the commit where `open` flips —
  // an effect gated on `open` would still see a null canvas and never register.
  const attachCanvas = useCallback((canvas: HTMLDivElement | null) => {
    canvasRef.current = canvas
    if (!canvas) return
    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const rect = canvas.getBoundingClientRect()
      pinchAnchorRef.current = {
        scale: viewRef.current.scale,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }
      const factor = Math.exp(-event.deltaY * PINCH_ZOOM_SPEED)
      setZoom((current) => {
        const base = current === 'fit' ? viewRef.current.fitScale : current
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, base * factor))
      })
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.scrollLeft = (canvas.scrollWidth - canvas.clientWidth) / 2
    canvas.scrollTop = (canvas.scrollHeight - canvas.clientHeight) / 2
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [])

  const fitScale =
    canvasSize && naturalSize
      ? Math.max(
          Math.min(
            (canvasSize.width - CANVAS_PADDING * 2) / naturalSize.width,
            (canvasSize.height - CANVAS_PADDING * 2) / naturalSize.height,
            1,
          ),
          0.01,
        )
      : 1
  const scale = zoom === 'fit' ? fitScale : zoom

  useEffect(() => {
    viewRef.current = { fitScale, scale }
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const anchor = pinchAnchorRef.current
    pinchAnchorRef.current = undefined
    if (anchor && anchor.scale !== scale) {
      // Pinch zooms around the cursor: keep the content point under it fixed.
      const factor = scale / anchor.scale
      canvas.scrollLeft = Math.max(
        0,
        Math.min(
          factor * (canvas.scrollLeft + anchor.x) - anchor.x,
          canvas.scrollWidth - canvas.clientWidth,
        ),
      )
      canvas.scrollTop = Math.max(
        0,
        Math.min(
          factor * (canvas.scrollTop + anchor.y) - anchor.y,
          canvas.scrollHeight - canvas.clientHeight,
        ),
      )
      return
    }
    canvas.scrollLeft = (canvas.scrollWidth - canvas.clientWidth) / 2
    canvas.scrollTop = (canvas.scrollHeight - canvas.clientHeight) / 2
  }, [scale])

  const handleDownload = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      if (isDesktopRuntime()) {
        await claude.saveImage({ dataUrl: src, name: alt })
        return
      }
      // Outside the desktop shell, fall back to a plain browser download.
      const link = document.createElement('a')
      link.download = alt
      link.href = src
      link.click()
    } finally {
      setIsSaving(false)
    }
  }

  const selectZoom = (next: Zoom) => {
    pinchAnchorRef.current = undefined
    setZoom(next)
    setIsZoomOpen(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="app-region-no-drag left-0! top-0! h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none bg-black/10 p-0 ring-0 backdrop-blur-xs sm:max-w-none"
        finalFocus={returnFocusRef}
        // Default dialog focus lands on the first tabbable element — the zoom button — so
        // focus the fullscreen container instead and keep the toolbar out of the open flow.
        initialFocus={dialogRef}
        isFullscreen
        ref={dialogRef}
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div
          className="absolute inset-0 overflow-auto scrollbar-none"
          ref={attachCanvas}
          onClick={(event) => {
            // The canvas is the viewer's backdrop: clicking anywhere but the image dismisses it.
            if (!(event.target instanceof Element) || !event.target.closest('img')) {
              onOpenChange(false)
            }
          }}
        >
          <div
            className="flex h-max w-max min-h-full min-w-full items-center justify-center"
            style={{ padding: CANVAS_PADDING }}
          >
            <img
              alt={alt}
              className={cn('object-contain', !naturalSize && 'invisible')}
              height={naturalSize ? naturalSize.height * scale : undefined}
              src={src}
              width={naturalSize ? naturalSize.width * scale : undefined}
              onLoad={(event) =>
                setNaturalSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
            />
          </div>
        </div>
        {isZoomOpen ? (
          // Sits between the canvas and the toolbar so any click outside the toolbar closes it.
          <div aria-hidden className="absolute inset-0 z-10" onClick={() => setIsZoomOpen(false)} />
        ) : null}
        {/* app-region-no-drag is load-bearing: the workbench keeps a window-drag strip across
            the top 40px, and Electron hit-tests it through this translucent overlay, which
            would swallow every click on the toolbar sitting inside that strip. The toolbar
            keeps equal top and right insets from the window corner. */}
        <div className="absolute top-2 right-2 z-20 flex items-center gap-2">
          <div className="relative">
            <Button
              aria-expanded={isZoomOpen}
              size="default"
              variant="secondary"
              onClick={() => setIsZoomOpen((current) => !current)}
            >
              {formatZoom(scale)}
              <ChevronDownIcon />
            </Button>
            {isZoomOpen ? (
              <div className="absolute top-[calc(100%+6px)] right-0 min-w-36 rounded-lg bg-popover p-1 text-popover-foreground shadow-popover ring-1 ring-foreground/10">
                {ZOOM_LEVELS.map((level) => (
                  <button
                    key={level}
                    className={ZOOM_ROW}
                    type="button"
                    onClick={() => {
                      selectZoom(level)
                    }}
                  >
                    {formatZoom(level)}
                    {zoom === level ? <CheckIcon className="ml-auto" /> : null}
                  </button>
                ))}
                <div className="my-1 h-px bg-border" />
                <button
                  className={ZOOM_ROW}
                  type="button"
                  onClick={() => {
                    selectZoom('fit')
                  }}
                >
                  {t('workbench.prompt.zoomToFit')}
                  {zoom === 'fit' ? <CheckIcon className="ml-auto" /> : null}
                </button>
              </div>
            ) : null}
          </div>
          <Button
            aria-label={t('workbench.prompt.downloadImage')}
            className="rounded-full"
            disabled={isSaving}
            size="icon"
            variant="secondary"
            onClick={handleDownload}
          >
            <DownloadIcon />
          </Button>
          <DialogClose render={<Button className="rounded-full" size="icon" variant="secondary" />}>
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
