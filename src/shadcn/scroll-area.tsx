import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import * as React from 'react'

import { useTransientScrollbarVisibility } from '@/shadcn/use-transient-scrollbar-visibility'
import { cn } from '@/shadcn/utils'

import './transient-scroll-area.css'

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.Ref<HTMLDivElement>
  orientation?: 'vertical' | 'horizontal'
  transient?: boolean
  viewportProps?: Omit<
    React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>,
    'children' | 'ref'
  >
}

function ScrollArea({
  className,
  children,
  transient = false,
  viewportRef,
  viewportProps,
  orientation = 'vertical',
  ref,
  ...props
}: ScrollAreaProps) {
  const rootRef = React.useRef<HTMLDivElement | null>(null)
  useTransientScrollbarVisibility(rootRef, {
    enabled: transient,
    trackScroll: orientation === 'horizontal',
  })

  const { className: viewportClassName, ...resolvedViewportProps } = viewportProps ?? {}

  const setRootRef = (node: HTMLDivElement | null) => {
    rootRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = node
  }

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      data-transient-scroll-area={transient ? 'true' : undefined}
      className={cn('relative', transient && 'transient-scroll-area', className)}
      {...props}
      ref={setRootRef}
    >
      <ScrollAreaPrimitive.Viewport
        {...resolvedViewportProps}
        data-slot="scroll-area-viewport"
        className={cn('size-full rounded-[inherit] outline-none', viewportClassName)}
        ref={viewportRef}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar orientation={orientation} />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      keepMounted
      orientation={orientation}
      className={cn(
        'flex touch-none p-px transition-colors select-none data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
