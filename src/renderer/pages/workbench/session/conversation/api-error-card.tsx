import { CircleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { failureTitleKey } from './failure-info'

/** 1s ticker driving the retry countdown; only ticks while a retry is pending. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export type ApiErrorCardProps = {
  /** retrying: SDK will retry shortly (countdown); settled: retry sequence ended; failed: turn failed. */
  state: 'retrying' | 'settled' | 'failed'
  status: number | null
  kind?: string
  detail?: string
  attempt?: number
  maxRetries?: number
  retryDelayMs?: number
  timestamp?: string
}

export function ApiErrorCard({
  state,
  status,
  kind,
  detail,
  attempt,
  maxRetries,
  retryDelayMs,
  timestamp,
}: ApiErrorCardProps) {
  const { t } = useTranslation()
  const now = useNow(state === 'retrying')
  const retryAt = timestamp ? Date.parse(timestamp) + (retryDelayMs ?? 0) : Number.NaN
  const remainingSeconds = Number.isFinite(retryAt)
    ? Math.max(0, Math.ceil((retryAt - now) / 1000))
    : null

  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/40 px-3 py-2.5">
      <CircleAlert className="size-4 shrink-0 self-center text-foreground-subtle" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">
          {t(failureTitleKey(status, kind))}
        </div>
        {state === 'retrying' && attempt !== undefined ? (
          <div className="mt-0.5 text-xs text-foreground-subtle">
            {status !== null ? `HTTP ${status} · ` : ''}
            {maxRetries
              ? t('workbench.conversation.apiRetry.attempt', { attempt, max: maxRetries })
              : t('workbench.conversation.apiRetry.attemptSimple', { attempt })}
          </div>
        ) : null}
        {state === 'settled' ? (
          <div className="mt-0.5 text-xs text-foreground-subtle">
            {detail ? `${detail} · ` : ''}
            {t('workbench.conversation.apiRetry.retried', { count: attempt ?? 0 })}
          </div>
        ) : null}
        {state === 'failed' && detail ? (
          <div className="mt-0.5 text-xs whitespace-pre-wrap wrap-break-word text-foreground-subtle">
            {detail}
          </div>
        ) : null}
      </div>
      {state === 'retrying' ? (
        <span className="shrink-0 self-center rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-foreground-subtle">
          {remainingSeconds !== null && remainingSeconds > 0
            ? t('workbench.conversation.apiRetry.retryIn', { seconds: remainingSeconds })
            : t('workbench.conversation.apiRetry.retrying')}
        </span>
      ) : null}
    </div>
  )
}
