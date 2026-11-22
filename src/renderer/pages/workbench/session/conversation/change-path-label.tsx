import { useLayoutEffect, useRef, useState } from 'react'

import { fitChangePath } from './change-path'

export function ChangePath({ path, fullPath }: { path: string; fullPath: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [display, setDisplay] = useState(path)

  useLayoutEffect(() => {
    const element = ref.current
    const context = document.createElement('canvas').getContext('2d')
    if (!element || !context) return
    const update = () => {
      const style = getComputedStyle(element)
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      setDisplay(
        fitChangePath(path, element.clientWidth, (text) => context.measureText(text).width),
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    document.fonts.ready.then(update)
    return () => observer.disconnect()
  }, [path])

  const index = display.lastIndexOf('/')
  return (
    <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap" ref={ref} title={fullPath}>
      <span className="text-foreground-subtlest">{display.slice(0, index + 1)}</span>
      <span className="text-foreground">{display.slice(index + 1)}</span>
    </span>
  )
}
