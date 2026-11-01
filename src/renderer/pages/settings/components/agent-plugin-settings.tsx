import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Spinner } from '@/shadcn/spinner'
import { Switch } from '@/shadcn/switch'
import { toast } from '@/shadcn/toast'

import {
  type AgentMarketplaceInfo,
  type AgentMarketplacePlugin,
  type AgentPluginInfo,
  addAgentMarketplace,
  installAgentPlugin,
  listAgentAvailablePlugins,
  listAgentMarketplaces,
  listAgentPlugins,
  refreshAgentMarketplace,
  removeAgentMarketplace,
  removeAgentPlugin,
  setAgentPluginEnabled,
} from '../../../services/claude/agent-config'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'

export function AgentPluginSettings() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<AgentPluginInfo[]>([])
  const [marketplaces, setMarketplaces] = useState<AgentMarketplaceInfo[]>([])
  const [catalog, setCatalog] = useState<AgentMarketplacePlugin[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [source, setSource] = useState('')
  const [isAddingMarketplace, setIsAddingMarketplace] = useState(false)

  const notifyRestart = () =>
    toast.add({
      id: 'agent-plugin-restart',
      title: t('settings.agent.plugins.restartHint'),
      type: 'info',
    })

  const reload = async () => {
    try {
      const [installed, marketplaceList] = await Promise.all([
        listAgentPlugins(),
        listAgentMarketplaces(),
      ])
      setPlugins(installed)
      setMarketplaces(marketplaceList)
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

  const handleRemove = async (id: string) => {
    try {
      await removeAgentPlugin(id)
      notifyRestart()
      await reload()
    } catch {
      toast.add({
        id: 'agent-plugin-remove',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  const handleAddMarketplace = async () => {
    if (!source.trim()) return
    setIsAddingMarketplace(true)
    try {
      await addAgentMarketplace(source.trim())
      setSource('')
      await reload()
    } catch {
      toast.add({
        id: 'agent-marketplace-add',
        title: t('settings.agent.plugins.marketplaceError'),
        type: 'error',
      })
    } finally {
      setIsAddingMarketplace(false)
    }
  }

  const handleRemoveMarketplace = async (name: string) => {
    try {
      await removeAgentMarketplace(name)
      await reload()
    } catch {
      toast.add({
        id: 'agent-marketplace-remove',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  const handleRefreshMarketplace = async (name?: string) => {
    try {
      await refreshAgentMarketplace(name)
      await reload()
      if (catalog) setCatalog(await listAgentAvailablePlugins())
    } catch {
      toast.add({
        id: 'agent-marketplace-refresh',
        title: t('settings.agent.plugins.refreshError'),
        type: 'error',
      })
    }
  }

  const handleBrowseCatalog = async () => {
    if (catalog) {
      setCatalog(null)
      return
    }
    try {
      setCatalog(await listAgentAvailablePlugins())
    } catch {
      toast.add({ id: 'agent-catalog-load', title: t('settings.agent.loadError'), type: 'error' })
    }
  }

  const handleInstall = async (pluginId: string) => {
    try {
      await installAgentPlugin(pluginId)
      notifyRestart()
      await reload()
    } catch {
      toast.add({
        id: 'agent-plugin-install',
        title: t('settings.agent.plugins.installError'),
        type: 'error',
      })
    }
  }

  const installedIds = new Set(plugins.map((plugin) => plugin.id))

  return (
    <div className="flex flex-col gap-8">
      <AgentSection titleKey="plugins">
        {isLoading ? (
          <Spinner className="self-center" />
        ) : plugins.length === 0 ? (
          <AgentEmpty />
        ) : (
          <div className="divide-y rounded-lg border">
            {plugins.map((plugin) => (
              <div className="flex min-h-14 items-center gap-3 px-4 py-2" key={plugin.id}>
                <Switch
                  aria-label={t('settings.agent.enabled')}
                  checked={plugin.enabled}
                  onCheckedChange={(enabled) => void handleToggle(plugin, enabled)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-normal">{plugin.name}</span>
                    <Badge variant="secondary">{plugin.version}</Badge>
                    <Badge variant="outline">{plugin.scope}</Badge>
                  </div>
                  <div className="truncate text-sm text-foreground-subtle">
                    {plugin.marketplace}
                    {plugin.notes?.length ? ` · ${plugin.notes.join(' · ')}` : ''}
                  </div>
                </div>
                <DeleteButton label={plugin.id} onDelete={() => handleRemove(plugin.id)} />
              </div>
            ))}
          </div>
        )}
      </AgentSection>

      <AgentSection titleKey="plugins">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              className="flex-1"
              placeholder={t('settings.agent.plugins.sourcePlaceholder')}
              value={source}
              onChange={(event) => setSource(event.target.value)}
            />
            <Button
              disabled={isAddingMarketplace || !source.trim()}
              onClick={() => void handleAddMarketplace()}
            >
              {isAddingMarketplace ? <Spinner /> : null}
              {t('settings.agent.plugins.addMarketplace')}
            </Button>
            <Button variant="outline" onClick={() => void handleBrowseCatalog()}>
              {t('settings.agent.plugins.browseCatalog')}
            </Button>
          </div>
          {catalog && (
            <div className="divide-y rounded-lg border">
              {catalog.length === 0 ? (
                <div className="px-4 py-3">
                  <AgentEmpty />
                </div>
              ) : (
                catalog.map((entry) => (
                  <div className="flex min-h-14 items-center gap-3 px-4 py-2" key={entry.pluginId}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-normal">{entry.name}</span>
                        {typeof entry.installCount === 'number' && (
                          <Badge variant="secondary">
                            {t('settings.agent.plugins.installCount', {
                              count: entry.installCount,
                            })}
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-sm text-foreground-subtle">
                        {entry.marketplaceName}
                        {entry.description ? ` · ${entry.description}` : ''}
                      </div>
                    </div>
                    {installedIds.has(entry.pluginId) ? (
                      <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleInstall(entry.pluginId)}
                      >
                        {t('settings.agent.plugins.install')}
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
          {marketplaces.length === 0 ? (
            <AgentEmpty />
          ) : (
            <div className="divide-y rounded-lg border">
              {marketplaces.map((marketplace) => (
                <div className="flex min-h-14 items-center gap-3 px-4 py-2" key={marketplace.name}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-normal">{marketplace.name}</div>
                    <div className="truncate text-sm text-foreground-subtle">
                      {marketplace.source.url ??
                        marketplace.source.repo ??
                        marketplace.source.source}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRefreshMarketplace(marketplace.name)}
                  >
                    {t('settings.agent.plugins.refresh')}
                  </Button>
                  <DeleteButton
                    label={marketplace.name}
                    onDelete={() => handleRemoveMarketplace(marketplace.name)}
                  />
                </div>
              ))}
            </div>
          )}
          {marketplaces.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => void handleRefreshMarketplace()}
            >
              {t('settings.agent.plugins.refreshAll')}
            </Button>
          )}
        </div>
      </AgentSection>
    </div>
  )
}
