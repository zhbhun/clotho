import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/shadcn/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'

import type { ProviderUsageQuota, ProviderUsageWindow } from '../../services/claude/claude'

const WINDOW_SHORT_LABELS: Record<string, string> = {
  fiveHour: '5H',
  weekly: '7D',
  monthly: '30D',
}

function windowLabel(name: string): string {
  return WINDOW_SHORT_LABELS[name] ?? name
}

function formatAbsoluteTime(resetsAt: string, language: string): string | null {
  const time = new Date(resetsAt).getTime()
  if (Number.isNaN(time)) return null
  return new Date(time).toLocaleString(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function balanceText(window: ProviderUsageWindow): string {
  const value =
    Math.abs(window.remaining ?? 0) >= 1000
      ? Math.round(window.remaining ?? 0).toLocaleString()
      : (window.remaining ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
  return `${value} ${window.unit ?? ''}`.trim()
}

/** Remaining-percentage text for the pill: 100 - used, clamped to 0–100. */
function remainingText(window: ProviderUsageWindow): string {
  const remaining = Math.round(Math.min(100, Math.max(0, 100 - (window.utilization ?? 0))))
  return `${remaining}%`
}

/** Ring geometry: outermost = longest period, matching the RING_PERIOD_HOURS order. */
const RING_RADII = [7, 4.5, 2]
const RING_STROKE_WIDTH = 2

/** Period length in hours used to rank rings; unknown windows rank shortest. */
const RING_PERIOD_HOURS: Record<string, number> = {
  monthly: 30 * 24,
  weekly: 7 * 24,
  fiveHour: 5,
}

/** Percentage windows for the rings, longest period first, at most one per ring. */
function ringWindows(quota: ProviderUsageQuota): ProviderUsageWindow[] {
  const windows = Array.isArray(quota.windows) ? quota.windows : []
  return windows
    .filter((window) => window.name !== 'balance' && window.utilization !== undefined)
    .sort((a, b) => (RING_PERIOD_HOURS[b.name] ?? 0) - (RING_PERIOD_HOURS[a.name] ?? 0))
    .slice(0, RING_RADII.length)
}

/** One line of tooltip detail, e.g. "5H remaining 77% · Resets Sep 16, 23:28". */
function WindowDetail({ language, window }: { language: string; window: ProviderUsageWindow }) {
  const { t } = useTranslation()
  const isBalance = window.name === 'balance'

  const absolute = window.resetsAt ? formatAbsoluteTime(window.resetsAt, language) : null
  const resetText = absolute ? t('settings.provider.usage.resetsAt', { time: absolute }) : null

  return (
    <div className="whitespace-nowrap">
      {isBalance ? (
        <>
          {t('settings.provider.usage.balance')}: {balanceText(window)}
        </>
      ) : (
        <>
          {windowLabel(window.name)} {t('settings.provider.usage.remaining')}{' '}
          {remainingText(window)}
        </>
      )}
      {resetText ? <span className="opacity-70"> · {resetText}</span> : null}
    </div>
  )
}

/** "5H 77% · 7D 43%" summaries for one provider's quota windows. */
function UsageWindowsSummary({ windows }: { windows: ProviderUsageWindow[] }) {
  return (
    <>
      {windows.map((window, index) => (
        <span key={window.name ?? index} className="inline-flex items-center gap-1">
          {index > 0 ? <span className="mr-1.5 text-foreground-subtlest">·</span> : null}
          {window.name === 'balance' ? (
            <span className="tabular-nums">{balanceText(window)}</span>
          ) : (
            <>
              <span className="font-medium">{windowLabel(window.name)}</span>
              <span className="tabular-nums">{remainingText(window)}</span>
            </>
          )}
        </span>
      ))}
    </>
  )
}

/**
 * Remaining quota as concentric rings for tight surfaces (the model menu's
 * provider headings): the outermost ring is the longest period (monthly >
 * weekly > five-hour), inner rings the shorter ones, at most three. A ring's
 * arc fills with the window's remaining share; balance windows carry no
 * percentage and are skipped. Hover shows the per-window reset times.
 */
export function ProviderUsageRings({ quota }: { quota: ProviderUsageQuota | undefined }) {
  const { i18n } = useTranslation()

  const windows = quota?.success ? ringWindows(quota) : []
  if (windows.length === 0) return null

  return (
    <Tooltip>
      <TooltipTrigger className="inline-flex shrink-0 items-center">
        <svg aria-hidden className="size-4" viewBox="0 0 20 20">
          {windows.map((window, index) => {
            const radius = RING_RADII[index]
            const circumference = 2 * Math.PI * radius
            const remaining = Math.min(100, Math.max(0, 100 - (window.utilization ?? 0)))
            const isExhausted = window.utilization !== undefined && window.utilization >= 100
            return (
              <g key={window.name ?? index}>
                <circle
                  className="stroke-border"
                  cx="10"
                  cy="10"
                  fill="none"
                  r={radius}
                  strokeWidth={RING_STROKE_WIDTH}
                />
                <circle
                  className={cn(
                    'origin-center -rotate-90 transition-[stroke-dashoffset]',
                    isExhausted ? 'stroke-destructive' : 'stroke-muted-foreground',
                  )}
                  cx="10"
                  cy="10"
                  fill="none"
                  r={radius}
                  strokeDasharray={circumference}
                  strokeDashoffset={circumference * (1 - remaining / 100)}
                  strokeLinecap="round"
                  strokeWidth={RING_STROKE_WIDTH}
                />
              </g>
            )
          })}
        </svg>
      </TooltipTrigger>
      <TooltipContent className="max-w-none flex-col items-start gap-0.5">
        {/* Rings nest longest-first; the tooltip lists the shortest period on top. */}
        {[...windows].reverse().map((window, index) => (
          <WindowDetail key={window.name ?? index} language={i18n.language} window={window} />
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Usage summary for one provider, rendered as a single pill next to the
 * provider name showing remaining quota per window; details (reset times)
 * live in the hover tooltip. Reads the shared provider-usage store via the
 * quota prop. Renders nothing while pending without cache or when the query
 * was never attempted; failures show an error pill with a retry affordance.
 */
export function ProviderUsageBadges({
  isPending,
  onRefresh,
  quota,
}: {
  isPending: boolean
  onRefresh?: () => void
  quota: ProviderUsageQuota | undefined
}) {
  const { t, i18n } = useTranslation()

  const refreshButton = onRefresh ? (
    <button
      aria-label={t('settings.provider.usage.refresh')}
      className={cn(
        'ml-0.5 flex cursor-pointer items-center rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50',
        isPending && 'animate-spin',
      )}
      disabled={isPending}
      type="button"
      onClick={onRefresh}
    >
      <RefreshCw className="size-2.5" />
    </button>
  ) : null

  // No cached result yet: stay invisible unless a query is in flight.
  if (!quota) {
    if (!isPending) return null
    return (
      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-transparent bg-secondary px-2 text-[0.625rem] font-medium text-secondary-foreground">
        <Spinner className="size-2.5" />
      </span>
    )
  }

  // Failures surface as a red error pill so the refresh button can retry.
  if (!quota.success) {
    return (
      <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full border border-transparent bg-secondary px-2 text-[0.625rem] font-medium text-destructive">
        <span className="max-w-40 truncate">
          {quota.error ?? t('settings.provider.usage.queryFailed')}
        </span>
        {refreshButton}
      </span>
    )
  }

  // Defensive: a malformed quota (e.g. from an older backend) must degrade to
  // no display instead of crashing the settings surface.
  const windows = Array.isArray(quota.windows) ? quota.windows : []
  if (windows.length === 0) return null

  const isExhausted = windows.some(
    (window) => window.utilization !== undefined && window.utilization >= 100,
  )

  return (
    <Tooltip>
      <TooltipTrigger
        className={cn(
          'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-secondary px-2 text-[0.625rem] font-medium whitespace-nowrap',
          isExhausted ? 'text-destructive' : 'text-secondary-foreground',
        )}
      >
        <UsageWindowsSummary windows={windows} />
        {refreshButton}
      </TooltipTrigger>
      <TooltipContent className="max-w-none flex-col items-start gap-0.5">
        {windows.map((window, index) => (
          <WindowDetail key={window.name ?? index} language={i18n.language} window={window} />
        ))}
      </TooltipContent>
    </Tooltip>
  )
}
