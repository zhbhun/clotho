import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Spinner } from '@/shadcn/spinner'
import { Switch } from '@/shadcn/switch'
import { toast } from '@/shadcn/toast'

import {
  type AgentPluginInfo,
  listAgentPlugins,
  setAgentPluginEnabled,
} from '../../../services/claude/agent-config'
import { AgentEmpty } from './agent-shared'
import {
  PluginOverflowMenu,
  RowChevron,
  refreshAllMarketplaces,
  useRestartHint,
} from './plugin-shared'
import { useSettingsDetailStore } from './settings-detail-store'
import { SettingsList, SettingsRow } from './settings-list'

/**
 * Top-level Plugins page: the installed plugin list. Header actions are the
 * Install entry (second level) and a `⋯` menu (refresh all, marketplaces).
 * Only user-scope plugins are listed for now; local (project) scope plugins
 * are deferred until a unified handling lands.
 */
export function PluginListPage() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<AgentPluginInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const openDetailAction = useSettingsDetailStore((state) => state.openDetail)
  const notifyRestart = useRestartHint()

  const reload = async () => {
    try {
      const installed = await listAgentPlugins()
      setPlugins(installed.filter((plugin) => plugin.scope === 'user'))
    } catch {
      toast.add({ id: 'agent-plugins-load', title: t('settings.agent.loadError'), type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = async (plugin: AgentPluginInfo, enabled: boolean) => {
    // Optimistic flip; the CLI call updates `enabledPlugins` in the CLI's
    // settings, shared with every Claude Code surface.
    setPlugins((current) =>
      current.map((entry) => (entry.id === plugin.id ? { ...entry, enabled } : entry)),
    )
    try {
      await setAgentPluginEnabled(plugin.id, enabled)
      notifyRestart()
    } catch {
      setPlugins((current) =>
        current.map((entry) => (entry.id === plugin.id ? { ...entry, enabled: !enabled } : entry)),
      )
      toast.add({ id: 'agent-plugin-toggle', title: t('settings.agent.saveError'), type: 'error' })
    }
  }

  const handleRefreshAll = () =>
    refreshAllMarketplaces(reload, t('settings.agent.plugins.refreshError'))

  const showInstallPage = () =>
    openDetailAction('agent-plugins', null, t('settings.agent.plugins.installPlugin'), 'install')
  const showMarketplacesPage = () =>
    openDetailAction(
      'agent-plugins',
      null,
      t('settings.agent.plugins.marketplaces'),
      'marketplaces',
    )

  return (
    <section className="flex flex-col gap-3" data-plugin-list-page>
      <div className="flex min-h-7 items-center justify-between gap-4">
        <h2 className="text-sm font-medium">
          {t('settings.agent.plugins.installed')}{' '}
          <span className="text-foreground-subtlest">
            {t('settings.agent.subagent.itemCount', { count: plugins.length })}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={showInstallPage}>
            {t('settings.agent.plugins.installPlugin')}
          </Button>
          <PluginOverflowMenu
            items={[
              {
                label: t('settings.agent.plugins.refreshAll'),
                onSelect: () => void handleRefreshAll(),
              },
              { label: t('settings.agent.plugins.marketplaces'), onSelect: showMarketplacesPage },
            ]}
            label={t('settings.agent.plugins.more')}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner className="self-center" />
      ) : plugins.length === 0 ? (
        <AgentEmpty />
      ) : (
        <SettingsList>
          {plugins.map((plugin) => (
            <SettingsRow
              className="gap-3 cursor-pointer transition-colors hover:bg-muted"
              key={plugin.id}
              variant="compact"
              onClick={() => openDetailAction('agent-plugins', plugin.id, plugin.name)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-normal">{plugin.name}</div>
                <div className="truncate text-sm text-foreground-subtle">
                  {[plugin.marketplace, plugin.version].filter(Boolean).join(' · ')}
                </div>
              </div>
              {/* The switch must not trigger the row-open navigation. */}
              <Switch
                aria-label={t('settings.agent.enabled')}
                checked={plugin.enabled}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(enabled) => void handleToggle(plugin, enabled)}
              />
              <RowChevron
                label={plugin.id}
                onOpen={() => openDetailAction('agent-plugins', plugin.id, plugin.name)}
              />
            </SettingsRow>
          ))}
        </SettingsList>
      )}
    </section>
  )
}
