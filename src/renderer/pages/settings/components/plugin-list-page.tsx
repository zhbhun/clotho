import { PackagePlus, RotateCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Switch } from '@/shadcn/switch'
import { toast } from '@/shadcn/toast'

import {
  type AgentPluginInfo,
  listAgentPlugins,
  setAgentPluginEnabled,
} from '../../../services/claude/agent-config'
import { AgentEmpty } from './agent-shared'
import { updateInstalled } from './catalog-cache'
import { PluginAvatar } from './plugin-avatar'
import { refreshAllMarketplaces, useRestartHint } from './plugin-shared'
import { PluginRowsSkeleton } from './plugin-skeletons'
import { useSettingsDetailStore } from './settings-detail-store'

/**
 * Top-level Plugins page: the installed plugin list. Header actions are the
 * refresh-all and install icon buttons.
 * Only user-scope plugins are listed for now; local (project) scope plugins
 * are deferred until a unified handling lands.
 */
export function PluginListPage({ onOpenMarketplace }: { onOpenMarketplace?: () => void }) {
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
      updateInstalled(plugin.id, enabled)
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

  return (
    <section className="flex flex-col gap-3" data-plugin-list-page>
      <div className="flex min-h-7 items-center justify-between gap-4">
        <h2 className="text-sm font-medium">
          {t('settings.agent.plugins.installed')}{' '}
          {!isLoading && (
            <span className="text-foreground-subtlest">
              {t('settings.agent.subagent.itemCount', { count: plugins.length })}
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            aria-label={t('settings.agent.plugins.refresh')}
            size="icon"
            variant="outline"
            onClick={() => void handleRefreshAll()}
          >
            <RotateCw className="size-4" />
          </Button>
          <Button
            aria-label={t('settings.categories.agentMarketplace')}
            onClick={onOpenMarketplace}
          >
            <PackagePlus data-icon="inline-start" />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <PluginRowsSkeleton />
      ) : plugins.length === 0 ? (
        <AgentEmpty />
      ) : (
        <div>
          {plugins.map((plugin) => (
            <div
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
              key={plugin.id}
              onClick={() => openDetailAction('agent-plugins', plugin.id, plugin.name)}
            >
              <PluginAvatar name={plugin.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{plugin.name}</div>
                <div className="truncate text-sm text-foreground-subtle">
                  {[plugin.marketplace, plugin.version].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Switch
                aria-label={t('settings.agent.enabled')}
                checked={plugin.enabled}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(enabled) => void handleToggle(plugin, enabled)}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
