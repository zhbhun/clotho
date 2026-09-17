import { useTranslation } from 'react-i18next'

import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/shadcn/hover-card'
import { cn } from '@/shadcn/utils'

import type { ClaudeContextUsageSnapshot } from '../../../../services/claude/claude'
import { buildContextRows, formatTokenCount } from './context-usage-rows'

export type ContextUsage = {
  usedTokens: number
  maxTokens: number
  percent: number
}

export type ContextUsageDetail = {
  snapshot: ClaudeContextUsageSnapshot | null
  averageCacheHitRate: number | null
  onOpen: () => void
}

export function ContextUsagePopover({
  children,
  detail,
  open,
  usage,
  onOpenChange,
}: {
  children: React.ReactNode
  detail: ContextUsageDetail
  open?: boolean
  usage: ContextUsage
  onOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation()

  const percent = usage.percent
  const usedTokens = usage.usedTokens
  const maxTokens = usage.maxTokens
  const categories = buildContextRows(detail.snapshot?.categories ?? [], (labelKey) => t(labelKey))

  return (
    <HoverCard
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) detail.onOpen()
        onOpenChange?.(nextOpen)
      }}
    >
      <HoverCardTrigger delay={150} closeDelay={100} render={<div className="inline-flex" />}>
        {children}
      </HoverCardTrigger>
      <HoverCardContent align="end" className="w-[26rem] p-3" glass side="top" sideOffset={8}>
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-medium">{t('workbench.prompt.contextPanelTitle')}</p>
          <div className="flex items-baseline justify-between">
            <span>{t('workbench.prompt.contextPanelPercent', { percent })}</span>
            <span className="tabular-nums text-foreground-subtlest">
              {t('workbench.prompt.contextPanelTokens', {
                max: formatTokenCount(maxTokens),
                used: formatTokenCount(usedTokens),
              })}
            </span>
          </div>
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-muted">
            {categories.map((row) => (
              <div
                className={cn('h-full shrink-0 rounded-full', row.segmentClass)}
                key={row.name}
                style={{ width: `${(row.tokens / (maxTokens || 1)) * 100}%` }}
              />
            ))}
          </div>
          {categories.length ? (
            <div className="flex flex-col gap-1.5">
              {categories.map((row) => (
                <div className="flex items-center gap-2" key={row.name}>
                  <span className={cn('size-2.5 shrink-0 rounded-sm', row.segmentClass)} />
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <span className="shrink-0 tabular-nums text-foreground-subtlest">
                    {formatTokenCount(row.tokens)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-foreground-subtlest">
              {t('workbench.prompt.contextPanelPendingHint')}
            </p>
          )}
          <div className="flex items-center justify-between border-t border-border pt-2">
            <span className="text-foreground-subtlest">
              {t('workbench.prompt.contextCacheHitRate')}
            </span>
            <span className="tabular-nums">
              {detail.averageCacheHitRate === null
                ? '—'
                : t('workbench.prompt.contextPanelPercent', {
                    percent: Math.round(detail.averageCacheHitRate * 100),
                  })}
            </span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
