import { Pencil, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import { Spinner } from '@/shadcn/spinner'

import { ProviderUsageBadges } from '../../../components/model-configuration/provider-usage-badges'
import type { ModelProvider, ProviderUsageQuota } from '../../../services/claude/claude'

export function ProviderListCard({
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
  onEdit: (trigger: HTMLButtonElement) => void
  onRefreshUsage?: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const name = provider.name || t('settings.provider.unnamed')

  return (
    <Card
      className="group/provider-card gap-0 py-0 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring/30"
      tabIndex={0}
    >
      <CardHeader className="py-4">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate font-normal">{name}</CardTitle>
          <Badge className="shrink-0 font-normal text-foreground-subtle" variant="secondary">
            {provider.models.length} {t('settings.provider.models')}
          </Badge>
          <ProviderUsageBadges
            isPending={isUsagePending}
            quota={usage}
            onRefresh={onRefreshUsage}
          />
        </div>
        <CardDescription className="truncate">{provider.baseURL || '—'}</CardDescription>
        <CardAction
          className="pointer-events-none flex self-center items-center gap-1 opacity-0 transition-opacity group-hover/provider-card:pointer-events-auto group-hover/provider-card:opacity-100 group-focus-within/provider-card:pointer-events-auto group-focus-within/provider-card:opacity-100"
          style={{ transition: 'none' }}
        >
          <Button
            aria-label={t('settings.provider.editProvider', { name })}
            size="icon"
            variant="mute"
            onClick={(event) => onEdit(event.currentTarget)}
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
        </CardAction>
      </CardHeader>
    </Card>
  )
}
