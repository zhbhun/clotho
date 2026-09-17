import { ArrowUpToLine, LocateFixed } from 'lucide-react'
import { type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'

/*
 * Sticky overlay pinned over the scroll viewport's top-right, on the same 32px row as the
 * pinned group headers. Sized to its content (w-max) so the group label it floats beside
 * stays visible; the opaque bg-sidebar keeps session rows readable while they pass under.
 * Z-index lives in session-sidebar.css with the other sticky layering rules.
 */
export function SessionListActions({
  canLocateCurrent,
  onLocateCurrent,
  onScrollToTop,
  onTabIntoSessions,
}: {
  canLocateCurrent: boolean
  onLocateCurrent: () => void
  onScrollToTop: () => void
  onTabIntoSessions: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className="sticky top-0 ml-auto flex h-8 w-max items-center gap-0.5 bg-sidebar pr-3 pl-1"
      data-session-list-actions
    >
      <ActionButton
        dataSidebar="locate-current-session"
        disabled={!canLocateCurrent}
        label={t('workbench.nav.locateCurrentSession')}
        onClick={onLocateCurrent}
      >
        <LocateFixed className="size-3.5 text-foreground-subtlest" strokeWidth={1.5} />
      </ActionButton>
      {/* The last tab stop before the virtualized rows: natural Tab cannot reach the
          roving-focused session when it sits outside the virtual window, so its forward
          Tab is intercepted to scroll the list and focus that session instead. */}
      <ActionButton
        dataSidebar="scroll-to-top"
        label={t('workbench.nav.backToTop')}
        onClick={onScrollToTop}
        onKeyDown={onTabIntoSessions}
      >
        <ArrowUpToLine className="size-3.5 text-foreground-subtlest" strokeWidth={1.5} />
      </ActionButton>
    </div>
  )
}

function ActionButton({
  dataSidebar,
  disabled,
  label,
  onClick,
  onKeyDown,
  children,
}: {
  dataSidebar: string
  disabled?: boolean
  label: string
  onClick: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            data-sidebar={dataSidebar}
            disabled={disabled}
            onClick={(event) => {
              onClick()
              // Drop the click focus: restored focus later (e.g. closing the settings
              // dialog) would re-open this tooltip even though the click is long over.
              event.currentTarget.blur()
            }}
            onKeyDown={onKeyDown}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {children}
          </Button>
        }
      />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}
