import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import type { AgentPluginDetails } from '@/shared/rpc'

import {
  getAgentPluginDetails,
  removeAgentPlugin,
  setAgentPluginEnabled,
} from '../../../services/claude/agent-config'
import { updateInstalled } from './catalog-cache'
import { PluginOverflowMenu, useRestartHint } from './plugin-shared'
import { useSettingsDetailStore } from './settings-detail-store'
import { SettingsList, SettingsRow } from './settings-list'

function DetailSection({
  count,
  title,
  children,
}: {
  count?: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-sm font-medium">
        {title}
        {typeof count === 'number' ? (
          <span className="text-foreground-subtlest">{count}</span>
        ) : null}
      </h3>
      {children}
    </div>
  )
}

function DetailRows({ rows }: { rows: { name: string; description?: string }[] }) {
  if (rows.length === 0) return null
  return (
    <SettingsList>
      {rows.map((row) => (
        <SettingsRow className="min-h-12 gap-3" key={row.name} variant="compact">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-normal">{row.name}</div>
            {row.description ? (
              <div className="truncate text-sm text-foreground-subtle">{row.description}</div>
            ) : null}
          </div>
        </SettingsRow>
      ))}
    </SettingsList>
  )
}

/** Shared component sections + info grid for the plugin/install detail pages. */
export function PluginDetailSections({
  details,
}: {
  details: Pick<AgentPluginDetails, 'skills' | 'mcpServers' | 'subagents'>
}) {
  const { t } = useTranslation()
  return (
    <>
      <DetailSection count={details.skills.length} title={t('settings.agent.plugins.skills')}>
        <DetailRows rows={details.skills} />
      </DetailSection>
      <DetailSection
        count={details.mcpServers.length}
        title={t('settings.agent.plugins.mcpServers')}
      >
        <DetailRows rows={details.mcpServers} />
      </DetailSection>
      <DetailSection count={details.subagents.length} title={t('settings.agent.plugins.subagents')}>
        <DetailRows rows={details.subagents} />
      </DetailSection>
    </>
  )
}

/** Key/value rows of the detail Info block. */
export function PluginInfoRows({ rows }: { rows: { key: string; value?: string | number }[] }) {
  const visible = rows.filter((row) => Boolean(row.value))
  if (visible.length === 0) return null
  return (
    <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
      {visible.map((row) => (
        <div className="grid grid-cols-[110px_1fr] gap-4 text-sm" key={row.key}>
          <span className="text-foreground-subtlest">{row.key}</span>
          <span className="min-w-0 truncate text-sm font-normal">{row.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Second-level plugin detail page: components, info block, and the `⋯` menu
 * with enable/disable and uninstall. Data comes from getAgentPluginDetails.
 */
export function PluginDetailPage({ pluginId }: { pluginId: string }) {
  const { t } = useTranslation()
  const [details, setDetails] = useState<AgentPluginDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const backToList = useSettingsDetailStore((state) => state.backToList)
  const notifyRestart = useRestartHint()

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getAgentPluginDetails(pluginId)
      .then((result) => {
        if (!cancelled) setDetails(result)
      })
      .catch(() => {
        if (!cancelled) {
          toast.add({
            id: 'agent-plugin-details',
            title: t('settings.agent.plugins.notFound'),
            type: 'error',
          })
          backToList()
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId])

  const handleToggle = async (enabled: boolean) => {
    if (!details) return
    setDetails((current) => (current ? { ...current, enabled } : current))
    try {
      await setAgentPluginEnabled(details.pluginId, enabled)
      updateInstalled(details.pluginId, enabled)
      notifyRestart()
    } catch {
      setDetails((current) => (current ? { ...current, enabled: !enabled } : current))
      toast.add({ id: 'agent-plugin-toggle', title: t('settings.agent.saveError'), type: 'error' })
    }
  }

  const handleUninstall = async () => {
    if (!details) return
    try {
      await removeAgentPlugin(details.pluginId)
      updateInstalled(details.pluginId, 'remove')
      notifyRestart()
      backToList()
    } catch {
      toast.add({
        id: 'agent-plugin-remove',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  if (isLoading || !details) {
    return (
      <section className="flex flex-col gap-4" data-plugin-detail-page>
        <Spinner className="self-center" />
      </section>
    )
  }

  const info: { key: string; value?: string }[] = [
    { key: t('settings.agent.plugins.author'), value: details.author },
    { key: t('settings.agent.plugins.category'), value: details.category },
    { key: t('settings.agent.plugins.version'), value: details.version },
    { key: t('settings.agent.plugins.marketplace'), value: details.marketplace },
    { key: t('settings.agent.plugins.rootPath'), value: details.installPath },
    {
      key: t('settings.agent.plugins.installedAt'),
      value: details.installedAt
        ? new Date(details.installedAt).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : undefined,
    },
  ]

  return (
    <section className="flex flex-col gap-5" data-plugin-detail-page>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-medium tracking-tight">{details.name}</h1>
          {details.description ? (
            <p className="mt-1 text-sm text-foreground-subtlest">{details.description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {details.installed ? (
            <PluginOverflowMenu
              items={[
                {
                  label: details.enabled
                    ? t('settings.agent.plugins.disable')
                    : t('settings.agent.plugins.enable'),
                  onSelect: () => void handleToggle(!details.enabled),
                },
                {
                  label: t('settings.agent.plugins.uninstall'),
                  onSelect: () => void handleUninstall(),
                  destructive: true,
                },
              ]}
              label={t('settings.agent.plugins.more')}
            />
          ) : null}
        </div>
      </div>

      <PluginDetailSections details={details} />

      <DetailSection title={t('settings.agent.plugins.info')}>
        <PluginInfoRows rows={info} />
        <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
          <div className="grid grid-cols-[110px_1fr] gap-4 text-sm">
            <span className="text-foreground-subtlest">{t('settings.agent.enabled')}</span>
            <span>
              {details.installed ? (
                <Badge variant="secondary">
                  {details.enabled
                    ? t('settings.agent.plugins.enable')
                    : t('settings.agent.plugins.disable')}
                </Badge>
              ) : (
                <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
              )}
            </span>
          </div>
        </div>
      </DetailSection>
    </section>
  )
}
