import { Archive, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { ShinyText } from '../../../../components/shiny-text'
import type { ConversationTimelineItem } from './types'

type CompactionItem = Extract<ConversationTimelineItem, { kind: 'compaction' }>

/**
 * Full-width divider marking a context compaction inside the turn timeline:
 * shiny "compacting" text while running, an archive receipt when done, an
 * alert on failure.
 */
export function CompactionDivider({
  item,
  isPending,
}: {
  isPending: boolean
  item: CompactionItem
}) {
  const { t } = useTranslation()
  const isCompacting = item.phase === 'compacting'

  const label =
    item.phase === 'compacting'
      ? t('workbench.conversation.compacting')
      : item.phase === 'failed'
        ? t('workbench.conversation.compactionFailed')
        : t('workbench.conversation.compacted')

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-px min-w-8 flex-1 bg-border" />
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1.5 text-xs',
          !isCompacting && 'text-foreground-subtlest',
        )}
      >
        {item.phase === 'done' ? <Archive className="size-3.5" /> : null}
        {item.phase === 'failed' ? <TriangleAlert className="size-3.5" /> : null}
        {isCompacting ? <ShinyText text={label} disabled={!isPending} /> : label}
      </span>
      <div className="h-px min-w-8 flex-1 bg-border" />
    </div>
  )
}
