import { useTranslation } from 'react-i18next'

import type { ContextUsage } from './context-usage-popover'

const RING_RADIUS = 7
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS
const RING_FRAME_CLASS = 'relative inline-flex size-5 items-center justify-center'
const RING_SVG_CLASS = 'size-4'
const RING_TRACK_CLASS = 'stroke-border'
const RING_ARC_CLASS = 'stroke-foreground-subtle'

export function ContextUsageRing({ usage }: { usage: ContextUsage }) {
  const { t } = useTranslation()
  const offset = RING_CIRCUMFERENCE - (usage.percent / 100) * RING_CIRCUMFERENCE
  const label = t('workbench.prompt.contextUsageLabel', { percent: usage.percent })

  return (
    <div
      aria-label={label}
      className={`${RING_FRAME_CLASS} rounded-full text-foreground-subtle`}
      role="img"
    >
      <svg aria-hidden className={RING_SVG_CLASS} viewBox="0 0 20 20">
        <circle
          className={RING_TRACK_CLASS}
          cx="10"
          cy="10"
          fill="none"
          r={RING_RADIUS}
          strokeWidth="2"
        />
        <circle
          className={`origin-center -rotate-90 ${RING_ARC_CLASS} transition-[stroke-dashoffset]`}
          cx="10"
          cy="10"
          fill="none"
          r={RING_RADIUS}
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}

/** Spinner shown in the ring's spot while an on-demand usage sample is in flight. */
export function ContextUsageSamplingRing() {
  const { t } = useTranslation()

  return (
    <div aria-label={t('workbench.prompt.contextSamplingLabel')} className={RING_FRAME_CLASS}>
      <svg aria-hidden className={`${RING_SVG_CLASS} animate-spin`} viewBox="0 0 20 20">
        <circle
          className={RING_TRACK_CLASS}
          cx="10"
          cy="10"
          fill="none"
          r={RING_RADIUS}
          strokeWidth="2"
        />
        <circle
          className={RING_ARC_CLASS}
          cx="10"
          cy="10"
          fill="none"
          r={RING_RADIUS}
          strokeDasharray={`${RING_CIRCUMFERENCE * 0.28} ${RING_CIRCUMFERENCE * 0.72}`}
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    </div>
  )
}
