import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { cn } from '@/shadcn/utils'

/** Row action on a project list item, revealed while the row is highlighted:
    moves the project into its own window without selecting the row. */
export function ProjectWindowAction({
  className,
  onOpen,
}: {
  className?: string
  onOpen: () => void
}) {
  const { t } = useTranslation()
  return (
    <Button
      aria-label={t('workbench.project.openInNewWindow')}
      className={cn(
        'shrink-0 opacity-0 transition-opacity group-hover/command-item:opacity-100 group-data-[selected=true]/command-item:opacity-100 focus-visible:opacity-100',
        className,
      )}
      size="icon-sm"
      title={t('workbench.project.openInNewWindow')}
      type="button"
      variant="ghost"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onOpen()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <ExternalLink className="size-3.5" strokeWidth={1.5} />
    </Button>
  )
}
