import type { CSSProperties } from 'react'

import { Badge } from '@/shadcn/badge'

/**
 * Deterministic letter avatar for catalog entries: the catalog data carries no
 * icon field, so a name-derived hue on a rounded square provides the store-style
 * visual anchor (validated in this folder's prototype, variant A).
 */
export function pluginNameHue(name: string): number {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return Math.round((hash * 137.508) % 360) % 360
}

export function PluginAvatar({
  name,
  className,
  rank,
}: {
  name: string
  className?: string
  rank?: number
}) {
  const hue = pluginNameHue(name)
  const letter = (Array.from(name)[0] ?? '?').toUpperCase()
  const palette =
    'bg-[hsl(var(--avatar-hue)_70%_90%)] text-[hsl(var(--avatar-hue)_46%_34%)] dark:bg-[hsl(var(--avatar-hue)_45%_22%)] dark:text-[hsl(var(--avatar-hue)_65%_78%)]'
  // Pastel-on-light and deep-on-dark: one hue variable, inverted lightness
  // split per theme so the tile never glows on dark surfaces.
  const style = { '--avatar-hue': hue } as CSSProperties
  return (
    <div
      aria-hidden
      className={`relative flex size-9 shrink-0 select-none items-center justify-center rounded-lg inset-ring-1 inset-ring-current/15 ${palette} ${className ?? ''}`}
      style={style}
    >
      {letter}
      {rank !== undefined && (
        <Badge
          variant="secondary"
          className="absolute -top-2 -left-2 min-w-5 px-1 text-[8px]"
          data-avatar-rank
        >
          {rank}
        </Badge>
      )}
    </div>
  )
}
