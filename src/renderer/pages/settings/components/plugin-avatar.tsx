import type { CSSProperties } from 'react'

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

export function PluginAvatar({ name }: { name: string }) {
  const hue = pluginNameHue(name)
  const letter = (Array.from(name)[0] ?? '?').toUpperCase()
  // Pastel-on-light and deep-on-dark: one hue variable, inverted lightness
  // split per theme so the tile never glows on dark surfaces.
  const style = { '--avatar-hue': hue } as CSSProperties
  return (
    <div
      aria-hidden
      className="flex size-9 shrink-0 select-none items-center justify-center rounded-lg bg-[hsl(var(--avatar-hue)_70%_90%)] text-[15px] font-semibold text-[hsl(var(--avatar-hue)_46%_34%)] dark:bg-[hsl(var(--avatar-hue)_45%_22%)] dark:text-[hsl(var(--avatar-hue)_65%_78%)]"
      style={style}
    >
      {letter}
    </div>
  )
}
