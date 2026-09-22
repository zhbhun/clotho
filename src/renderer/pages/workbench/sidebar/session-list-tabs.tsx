import { ArrowUpToLine, LocateFixed } from 'lucide-react'
import { type KeyboardEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'

import type { SessionSidebarTab } from '../hooks/use-projects'

const TABS: {
  labelKey: 'workbench.nav.tabCurrent' | 'workbench.nav.tabHistory'
  value: SessionSidebarTab
}[] = [
  { labelKey: 'workbench.nav.tabCurrent', value: 'current' },
  { labelKey: 'workbench.nav.tabHistory', value: 'history' },
]

/*
 * Fixed bar between the new-chat button and the session list: the current/history
 * switch on the left, locate and back-to-top on the right. It never scrolls with
 * the list — the group labels inside the list are plain rows since this replaced
 * the sticky overlay. A plain segmented button rather than the Tabs component: it
 * swaps list views, so keeping it out of the page's tab semantics matters more
 * than the widget role.
 */
export function SessionListTabs({
  activeTab,
  canLocateCurrent,
  onLocateCurrent,
  onScrollToTop,
  onTabChange,
  onTabIntoSessions,
}: {
  activeTab: SessionSidebarTab
  canLocateCurrent: boolean
  onLocateCurrent: () => void
  onScrollToTop: () => void
  onTabChange: (tab: SessionSidebarTab) => void
  onTabIntoSessions: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex h-8 items-center gap-0.5 px-2" data-session-list-tabs>
      {/* The tray stays a whisper above the sidebar surface (zcode-style): a faint
          tint, with the selected pill just one step lighter — a filled tray or a
          high-contrast pill both read as a heavy chip. Dark mode needs a faint
          outline or the background pill vanishes against the sidebar. */}
      <div className="me-auto flex items-center gap-0 rounded-full bg-sidebar-foreground/5 p-0.5">
        {TABS.map((tab) => (
          <button
            className={cn(
              'h-6 rounded-full px-2 text-xs whitespace-nowrap transition-colors outline-none',
              tab.value === activeTab
                ? 'bg-background/50 text-foreground dark:border dark:border-input dark:bg-input/30'
                : 'text-foreground-subtlest hover:text-foreground',
            )}
            data-session-tab={tab.value}
            key={tab.value}
            type="button"
            onClick={() => onTabChange(tab.value)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
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
