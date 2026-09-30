import { useLayoutEffect, useRef, useState } from 'react'

import { shortMiddlePath } from '../../utils/path-display'

/** Character budget while the row cannot be measured (e.g. jsdom tests). */
const UNMEASURED_MAX = 80

let measureContext: CanvasRenderingContext2D | null | undefined

function textMeasurer() {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement('canvas').getContext('2d')
    } catch {
      measureContext = null
    }
  }
  return measureContext
}

/** Longest middle-ellipsized form of `path` that renders inside `available` px. */
function fitMiddlePath(path: string, available: number, context: CanvasRenderingContext2D) {
  if (context.measureText(path).width <= available) return path

  let low = 0
  let high = path.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (context.measureText(shortMiddlePath(path, mid)).width <= available) {
      low = mid
    } else {
      high = mid - 1
    }
  }
  return shortMiddlePath(path, low)
}

/** Path label that elides its middle to the measured row width instead of
    clipping its tail, keeping both the root and the last segments visible.
    The owning flex row must give the span a content-independent width
    (`flex-1 min-w-0`) so refitting cannot oscillate. */
export function MiddlePath({ path, className }: { path: string; className?: string }) {
  const [text, setText] = useState(() => shortMiddlePath(path, UNMEASURED_MAX))
  const spanRef = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    const span = spanRef.current
    const context = textMeasurer()
    if (!span || !context || typeof ResizeObserver === 'undefined') {
      setText(shortMiddlePath(path, UNMEASURED_MAX))
      return
    }

    const fit = () => {
      const style = window.getComputedStyle(span)
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      setText(fitMiddlePath(path, Math.max(0, span.clientWidth - 1), context))
    }

    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(span)
    return () => observer.disconnect()
  }, [path])

  return (
    <span className={className} ref={spanRef}>
      {text}
    </span>
  )
}
