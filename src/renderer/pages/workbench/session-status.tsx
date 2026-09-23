import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import type { MessageKey } from '../../i18n/resources'
import './session-status.css'
import type { SessionActivity } from './stores/workbench-store'

const ACTIVITY_LABEL_KEYS: Partial<Record<SessionActivity, MessageKey>> = {
  processing: 'workbench.session.status.processing',
  'awaiting-user': 'workbench.session.status.awaitingUser',
  'unread-success': 'workbench.session.status.unreadSuccess',
  'unread-error': 'workbench.session.status.unreadError',
}

const ACTIVITY_DOT_CLASSES: Partial<Record<SessionActivity, string>> = {
  'awaiting-user': 'bg-status-confirm',
  'unread-success': 'bg-status-unread',
  'unread-error': 'bg-destructive',
}

// The icon wrapper stays mounted across activities so the shrink/grow between
// idle and processing animates through a transition instead of a remount.
export function SessionStatus({ activity, icon }: { activity: SessionActivity; icon?: ReactNode }) {
  const { t } = useTranslation()
  const labelKey = ACTIVITY_LABEL_KEYS[activity]
  const dotClassName = ACTIVITY_DOT_CLASSES[activity]
  const isProcessing = activity === 'processing'

  return (
    <span
      className="relative flex size-4 shrink-0 items-center justify-center"
      data-session-status={labelKey ? activity : undefined}
      data-session-status-slot
    >
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'session-status-icon flex size-4 items-center justify-center transition-transform duration-200 ease-out',
            isProcessing ? 'scale-[0.5]' : 'scale-100',
          )}
        >
          {icon}
        </span>
      ) : null}
      {isProcessing ? (
        <SessionSpinner
          // !: SidebarMenuButton forces [&_svg]:size-4, which would win over
          // a plain size-* class and pin the spinner back to 16px.
          className={icon ? 'absolute inset-0' : 'absolute inset-0 m-auto size-3!'}
          withTrack={!icon}
        />
      ) : null}
      {icon ? (
        // Badge dot pinned to the icon's top-right corner. It stays mounted so
        // it fades in and out instead of popping, and the icon never hides.
        <span
          aria-hidden="true"
          className={cn(
            'absolute -right-0.5 -top-0.5 size-1.5 rounded-full transition-opacity duration-200',
            dotClassName ? cn('shadow-[0_0_0_1.5px_var(--background)]', dotClassName) : 'opacity-0',
          )}
        />
      ) : dotClassName ? (
        // Sidebar rows have no session icon: keep the plain centered dot,
        // one step larger than the tab's corner badge.
        <span className={cn('size-2 rounded-full', dotClassName)} />
      ) : null}
      {labelKey ? <span className="sr-only">{t(labelKey)}</span> : null}
    </span>
  )
}

function SessionSpinner({
  className,
  withTrack = false,
}: {
  className?: string
  withTrack?: boolean
}) {
  // 3/4 arc: circumference 2π×6.5 ≈ 40.84 → dash 30.63.
  return (
    <svg
      aria-hidden="true"
      className={cn(
        'session-status-spinner size-4 animate-spin text-foreground-subtlest',
        className,
      )}
      viewBox="0 0 16 16"
    >
      {withTrack ? (
        // Faint full ring under the arc, so the spinner reads as a circle.
        <circle
          cx="8"
          cy="8"
          fill="none"
          opacity="0.25"
          r="6.5"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      ) : null}
      <circle
        cx="8"
        cy="8"
        fill="none"
        r="6.5"
        stroke="currentColor"
        strokeDasharray="30.63 10.21"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
