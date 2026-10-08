import { Brain } from 'lucide-react'

import { ShinyText } from '../../../../components/shiny-text'

/** Waiting-for-the-model row: a static brain glyph next to shining "Thinking…". */
export function ThinkingIndicator() {
  return (
    <div aria-live="polite" className="inline-flex items-center gap-1.5 leading-6">
      <Brain aria-hidden className="size-3.5 shrink-0 text-foreground-subtlest" />
      <ShinyText text="Thinking…" />
    </div>
  )
}
