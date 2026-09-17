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

export function SessionStatus({ activity }: { activity: SessionActivity }) {
  const { t } = useTranslation()
  const labelKey = ACTIVITY_LABEL_KEYS[activity]
  if (!labelKey) return null

  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center"
      data-session-status={activity}
      data-session-status-slot
    >
      <span
        aria-hidden="true"
        className={cn(
          'size-1.5 rounded-full',
          activity === 'processing' && 'session-status-processing bg-foreground-subtle',
          activity === 'awaiting-user' && 'bg-status-confirm',
          activity === 'unread-success' && 'bg-status-unread',
          activity === 'unread-error' && 'bg-destructive',
        )}
      />
      <span className="sr-only">{t(labelKey)}</span>
    </span>
  )
}
