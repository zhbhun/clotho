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
  type AgentPluginInfo,
  addAgentMarketplace,
  getAgentCapabilityToggles,
  installAgentPlugin,
  listAgentMarketplaces,
  listAgentPlugins,
  removeAgentMarketplace,
  removeAgentPlugin,
  setAgentCapabilityToggle,
} from '../../../services/claude/agent-config'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'

export function AgentPluginSettings() {
  const { t } = useTranslation()
  const [plugins, setPlugins] = useState<AgentPluginInfo[]>([])
  const [marketplaces, setMarketplaces] = useState<AgentMarketplaceInfo[]>([])
  const [disabledPlugins, setDisabledPlugins] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [gitUrl, setGitUrl] = useState('')
  const [isAddingMarketplace, setIsAddingMarketplace] = useState(false)

  const reload = async () => {
    try {
      const [installed, marketplaceList, toggles] = await Promise.all([
        listAgentPlugins(),
        listAgentMarketplaces(),
        getAgentCapabilityToggles(),
      ])
      setPlugins(installed)
      setMarketplaces(marketplaceList)
      setDisabledPlugins(toggles.disabledPlugins)
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

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      const toggles = await setAgentCapabilityToggle('plugin', id, enabled)
      setDisabledPlugins(toggles.disabledPlugins)
    } catch {
      toast.add({ id: 'agent-plugin-toggle', title: t('settings.agent.saveError'), type: 'error' })
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await removeAgentPlugin(id)
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
    if (!gitUrl.trim()) return
    setIsAddingMarketplace(true)
    try {
      await addAgentMarketplace(gitUrl.trim())
      setGitUrl('')
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

  const handleInstall = async (marketplace: string, plugin: string) => {
    try {
      await installAgentPlugin(marketplace, plugin)
      await reload()
    } catch {
      toast.add({
        id: 'agent-plugin-install',
        title: t('settings.agent.plugins.installError'),
        type: 'error',
      })
    }
  }

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
                  checked={!disabledPlugins.includes(plugin.id)}
                  onCheckedChange={(enabled) => void handleToggle(plugin.id, enabled)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-normal">{plugin.name}</span>
                    <Badge variant="secondary">{plugin.version}</Badge>
                  </div>
                  <div className="truncate text-sm text-foreground-subtle">
                    {plugin.marketplace}
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
              placeholder={t('settings.agent.plugins.gitUrl')}
              value={gitUrl}
              onChange={(event) => setGitUrl(event.target.value)}
            />
            <Button
              disabled={isAddingMarketplace || !gitUrl.trim()}
              onClick={() => void handleAddMarketplace()}
            >
              {isAddingMarketplace ? <Spinner /> : null}
              {t('settings.agent.plugins.addMarketplace')}
            </Button>
          </div>
          {marketplaces.length === 0 ? (
            <AgentEmpty />
          ) : (
            <div className="divide-y rounded-lg border">
              {marketplaces.map((marketplace) => {
                const installedNames = new Set(plugins.map((plugin) => plugin.name))
                return (
                  <div className="flex flex-col gap-2 px-4 py-3" key={marketplace.name}>
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-normal">{marketplace.name}</div>
                        <div className="truncate text-sm text-foreground-subtle">
                          {marketplace.source.url ??
                            marketplace.source.repo ??
                            marketplace.source.source}
                        </div>
                      </div>
                      <DeleteButton
                        label={marketplace.name}
                        onDelete={() => handleRemoveMarketplace(marketplace.name)}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {marketplace.plugins.map((plugin) => (
                        <div
                          className="flex items-center gap-2 rounded-md border px-3 py-1.5"
                          key={plugin.name}
                        >
                          <span className="text-sm">{plugin.name}</span>
                          {installedNames.has(plugin.name) ? (
                            <Badge variant="secondary">
                              {t('settings.agent.plugins.installed')}
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void handleInstall(marketplace.name, plugin.name)}
                            >
                              {t('settings.agent.plugins.install')}
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </AgentSection>
    </div>
  )
}
