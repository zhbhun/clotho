import type { ReactNode } from 'react'

/**
 * Shared section heading used by settings-shaped surfaces.
 * Only for pages with multiple named groups; single-content categories
 * (e.g. shortcuts, projects) rely on the category title alone.
 */
export function SettingsSection({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-7 items-center justify-between gap-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}
