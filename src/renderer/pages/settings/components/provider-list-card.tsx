import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Spinner } from '@/shadcn/spinner'

import { ProviderUsageBadges } from '../../../components/model-configuration/provider-usage-badges'
import type { ModelProvider, ProviderUsageQuota } from '../../../services/claude/claude'
import { SettingsRow, markAsRow } from './settings-list'

export const ProviderListRow = markAsRow(function ProviderListRow({
  isDeleteDisabled,
  isDeleting,
  isUsagePending,
  provider,
  usage,
  onEdit,
  onRefreshUsage,
  onDelete,
}: {
  isDeleteDisabled: boolean
  isDeleting: boolean
  isUsagePending: boolean
  provider: ModelProvider
  usage: ProviderUsageQuota | undefined
  onEdit: () => void
  onRefreshUsage?: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const name = provider.name || t('settings.provider.unnamed')

  return (
    <SettingsRow
      className="gap-2 py-3 focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none focus-visible:-outline-offset-2"
      tabIndex={0}
      variant="compact"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-normal">{name}</span>
          <Badge className="shrink-0 font-normal text-foreground-subtle" variant="secondary">
            {provider.models.length} {t('settings.provider.models')}
          </Badge>
          <ProviderUsageBadges
            isPending={isUsagePending}
            quota={usage}
            onRefresh={onRefreshUsage}
          />
        </div>
        <div className="truncate text-xs/relaxed text-muted-foreground">
          {provider.baseURL || '—'}
        </div>
      </div>
      <div className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/settings-row:pointer-events-auto group-hover/settings-row:opacity-100 group-focus-within/settings-row:pointer-events-auto group-focus-within/settings-row:opacity-100">
        <Button
          aria-label={t('settings.provider.editProvider', { name })}
          size="icon"
          variant="mute"
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <Button
          aria-label={t('settings.provider.deleteProvider', { name })}
          disabled={isDeleteDisabled}
          size="icon"
          variant="mute"
          onClick={onDelete}
        >
          {isDeleting ? <Spinner /> : <Trash2 />}
        </Button>
      </div>
    </SettingsRow>
  )
})
