import { useLayoutEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { SidebarMenuButton, SidebarMenuItem } from '@/shadcn/sidebar'
import { cn } from '@/shadcn/utils'

import { ProjectIcon } from '../../../components/project-icon'
import { SessionContextMenu } from '../components/session-context-menu'
import { SessionStatus } from '../session-status'
import type { SessionActivity, WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'
import { sessionDisplayTitle } from '../utils/session-list'

export function SessionItem({
  activity = 'idle',
  focusRequestRevision,
  isActive,
  isFocused,
  isHoverFrozen,
  isPinned,
  project,
  projectLabel,
  session,
  onClick,
  onDeleteSession,
  onRenameSession,
  onTogglePinSession,
}: {
  activity?: SessionActivity
  focusRequestRevision?: number
  isActive: boolean
  isFocused: boolean
  isHoverFrozen: boolean
  isPinned: boolean
  project?: WorkbenchProject
  projectLabel: string
  session: WorkbenchSession
  onClick: () => void
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  const title = sessionDisplayTitle(session, t)
  const displayTitle = title
  const displayedActivity = session.isDraft ? 'idle' : activity
  const buttonRef = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    if (focusRequestRevision === undefined) return
    buttonRef.current?.focus({ preventScroll: true, focusVisible: true })
  }, [focusRequestRevision])

  const sessionButton = (
    <SidebarMenuButton
      className={cn(
        'h-12 items-stretch px-2 py-1.5 text-sm font-normal',
        // :hover is suppressed while the list scrolls, so the frozen row re-applies
        // the hover tokens itself to keep the scroll-start highlight visible.
        isHoverFrozen && 'bg-sidebar-accent text-sidebar-accent-foreground',
      )}
      isActive={isActive}
      ref={buttonRef}
      size="lg"
      tabIndex={isFocused ? 0 : -1}
      type="button"
      onClick={onClick}
    >
      <span className="flex w-full min-w-0 items-stretch gap-2">
        <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          {/* shrink-0: truncate zeroes the flex minimum, so without it the title absorbs
              any content overflow in this fixed-height button and clips its own line box. */}
          <span className="shrink-0 truncate leading-5 font-normal">{displayTitle}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-foreground-subtlest">
            <span data-session-project-icon={project ? 'project' : 'default'}>
              <ProjectIcon
                className="text-foreground-subtlest"
                plain
                icon={project?.icon}
                size="compact"
              />
            </span>
            <span className="truncate">{projectLabel}</span>
          </span>
        </span>
        {displayedActivity !== 'idle' ? (
          <span
            className="flex min-h-full w-4 shrink-0 items-center justify-center"
            data-session-status-column
          >
            <SessionStatus activity={displayedActivity} />
          </span>
        ) : null}
      </span>
    </SidebarMenuButton>
  )

  return (
    <SessionContextMenu
      isPinned={isPinned}
      session={session}
      onDeleteSession={onDeleteSession}
      onRenameSession={onRenameSession}
      onTogglePinSession={onTogglePinSession}
    >
      <SidebarMenuItem data-focused={isFocused ? 'true' : undefined} data-session-item={session.id}>
        {sessionButton}
      </SidebarMenuItem>
    </SessionContextMenu>
  )
}
