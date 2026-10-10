import { Brain } from 'lucide-react'

import { ShinyText } from '../../../../components/shiny-text'

/**
 * Waiting-for-the-model row: a static brain glyph next to shining "Thinking…".
 * The glyph presumes visible work above (the Working line); the subagent view
 * has no such line, so its placeholder passes hasIcon={false}.
 */
export function ThinkingIndicator({ hasIcon = true }: { hasIcon?: boolean }) {
  return (
    <div aria-live="polite" className="inline-flex items-center gap-1.5 leading-6">
      {hasIcon ? (
        <Brain aria-hidden className="size-3.5 shrink-0 text-foreground-subtlest" />
      ) : null}
      <ShinyText text="Thinking…" />
    </div>
  )
}
