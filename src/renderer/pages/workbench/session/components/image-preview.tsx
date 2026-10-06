import { CheckIcon, ChevronDownIcon, DownloadIcon, XIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/shadcn/dialog'
import { cn } from '@/shadcn/utils'

import { claude } from '../../../../services/claude/claude'
import { isDesktopRuntime } from '../../../../services/desktop/client'

type ImageSize = { width: number; height: number }
type Zoom = 'fit' | number

const ZOOM_LEVELS: number[] = [0.25, 0.5, 1, 1.5, 2]

// The canvas padding doubles as the whitespace revealed when a zoomed image is scrolled to its
// edges; the fit scale subtracts it so a fitted image never slides under the floating toolbar.
const CANVAS_PADDING = 48

const TOOLBAR_BUTTON = 'rounded-full bg-popover text-popover-foreground ring-1 ring-foreground/10'
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
  src,
}: {
  alt: string
  open: boolean
  onOpenChange: (open: boolean) => void
  src: string
}) {
  const { t } = useTranslation()
  const [zoom, setZoom] = useState<Zoom>('fit')
  const [isZoomOpen, setIsZoomOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [canvasSize, setCanvasSize] = useState<ImageSize>()
  const [naturalSize, setNaturalSize] = useState<ImageSize>()
  const canvasRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setZoom('fit')
      setIsZoomOpen(false)
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

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.scrollLeft = (canvas.scrollWidth - canvas.clientWidth) / 2
    canvas.scrollTop = (canvas.scrollHeight - canvas.clientHeight) / 2
  }, [zoom])

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
    setZoom(next)
    setIsZoomOpen(false)
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="app-region-no-drag left-0! top-0! h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none bg-black/10 p-0 ring-0 backdrop-blur-xs sm:max-w-none"
        isFullscreen
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        <div
          className="absolute inset-0 overflow-auto scrollbar-none"
          ref={canvasRef}
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
            would swallow every click on the toolbar sitting inside that strip. */}
        <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
          <div className="relative">
            <Button
              aria-expanded={isZoomOpen}
              className={cn(TOOLBAR_BUTTON, 'rounded-lg')}
              size="lg"
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
            className={TOOLBAR_BUTTON}
            disabled={isSaving}
            size="icon-lg"
            variant="secondary"
            onClick={handleDownload}
          >
            <DownloadIcon />
          </Button>
          <DialogClose
            render={<Button className={TOOLBAR_BUTTON} size="icon-lg" variant="secondary" />}
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
