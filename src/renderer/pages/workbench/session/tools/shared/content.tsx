import { ChevronDown, ChevronUp } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  type ComponentProps,
  type ReactNode,
  forwardRef,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'

import type { ClaudeImageSource } from '../../../../../services/claude/claude'

const BODY_COLLAPSE_THRESHOLD_PX = 250

export function HeightCollapsible({
  text,
  mono = false,
  edgeOverlay = false,
}: {
  text: string
  mono?: boolean
  edgeOverlay?: boolean
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLPreElement>(null)
  const [overflows, setOverflows] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setOverflows(el.scrollHeight > BODY_COLLAPSE_THRESHOLD_PX)
  }, [text])

  if (!text) return null
  const collapsed = overflows && !expanded

  return (
    <div>
      <div className={cn('relative', collapsed && 'max-h-[250px] overflow-hidden')}>
        <pre
          ref={ref}
          className={cn(
            'min-w-0 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground-subtlest',
            mono && 'font-mono',
          )}
        >
          {text}
        </pre>
        {collapsed ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent',
              edgeOverlay
                ? 'from-code-surface via-code-surface/60'
                : 'from-background/95 via-background/65',
            )}
            data-testid="terminal-transcript-fade"
          />
        ) : null}
        {overflows ? (
          <div className="absolute inset-x-0 bottom-0 flex justify-center">
            <Button
              aria-label={expanded ? t('tools.content.showLess') : t('tools.content.showMore')}
              className="text-foreground-subtlest hover:bg-transparent hover:text-foreground-subtle"
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function ImageGallery({ images }: { images: ClaudeImageSource[] }) {
  const { t } = useTranslation()
  const [active, setActive] = useState<number | null>(null)

  return (
    <div className="flex flex-wrap gap-1.5">
      {images.map((image, index) => {
        const data = image.data
          ? `data:${image.media_type ?? 'image/png'};base64,${image.data}`
          : null
        if (!data) return null

        return (
          <button
            key={index}
            className="overflow-hidden rounded border border-border/50"
            type="button"
            onClick={() => setActive(index)}
          >
            <img
              alt={t('tools.content.image', { count: index + 1 })}
              className="max-h-24 max-w-[160px] object-cover"
              src={data}
            />
          </button>
        )
      })}
      {active != null && images[active]?.data ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-8 backdrop-blur"
          role="button"
          tabIndex={0}
          onClick={() => setActive(null)}
          onKeyDown={(event) => event.key === 'Escape' && setActive(null)}
        >
          <img
            alt={t('tools.content.image', { count: active + 1 })}
            className="max-h-full max-w-full rounded-lg shadow-lg"
            src={`data:${images[active].media_type ?? 'image/png'};base64,${images[active].data}`}
          />
        </div>
      ) : null}
    </div>
  )
}

export function ParamsInput({ params }: { params: Record<string, string> }) {
  const entries = Object.entries(params).filter(([, value]) => value)
  if (!entries.length) return null

  return (
    <div className="flex flex-col gap-0.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex min-w-0 gap-1.5 font-mono text-xs">
          <span className="shrink-0 text-foreground-subtlest">{key}:</span>
          <span className="truncate text-foreground-subtlest">{value}</span>
        </div>
      ))}
    </div>
  )
}

export function JsonInput({ input }: { input: unknown }) {
  if (input == null) return null

  let text: string
  try {
    text = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
  } catch {
    text = String(input)
  }

  return <HeightCollapsible text={text} mono edgeOverlay />
}

export function ToolResultNote({ note }: { note?: string }) {
  if (!note) return null

  return (
    <div
      className="text-xs leading-5 text-foreground-subtlest whitespace-pre-wrap break-words"
      data-testid="tool-item-note"
    >
      {note}
    </div>
  )
}

type WorkItemLabelProps = {
  children?: ReactNode
  error?: boolean
  className?: string
} & Omit<ComponentProps<'span'>, 'className' | 'children'>

export const WorkItemLabel = forwardRef<HTMLSpanElement, WorkItemLabelProps>(
  ({ children, error = false, className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        'shrink-0',
        error ? 'text-destructive/60 group-hover:text-destructive' : 'text-foreground-subtle',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  ),
)
WorkItemLabel.displayName = 'WorkItemLabel'

export function ToolGlyph({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className="size-3.5" data-slot="tool-icon" />
}

export function ToolIcon({
  icon,
  description,
  errorMessage,
  isError = false,
  className,
}: {
  icon: LucideIcon
  description: string
  errorMessage?: string
  isError?: boolean
  className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<WorkItemLabel className={className} error={isError} />}>
        <ToolGlyph icon={icon} />
      </TooltipTrigger>
      <TooltipContent align="start" className={cn(errorMessage && 'max-w-md')} side="top">
        {errorMessage ? (
          <div className="flex flex-col items-start gap-0.5">
            <span>{description}</span>
            <span className="whitespace-pre-wrap break-words opacity-70">{errorMessage}</span>
          </div>
        ) : (
          description
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'select-none font-mono text-xs tracking-wide text-foreground-subtlest',
        className,
      )}
    >
      {children}
    </span>
  )
}
