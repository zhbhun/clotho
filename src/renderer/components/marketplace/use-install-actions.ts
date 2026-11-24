import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/shadcn/toast'

import { removeAgentPlugin, setAgentPluginEnabled } from '../../services/claude/agent-config'
import { requestFromDesktop } from '../../services/desktop/client'
import { updateInstalled, useCatalogCache } from './catalog-cache'
import type { CatalogEntry } from './install-catalog'
import { installPluginWithToast, useRestartHint } from './plugin-shared'
import { usePluginHomepages } from './use-plugin-homepages'

/** Share installed state and actions across every occurrence of a plugin. */
export function useInstallActions(entries: CatalogEntry[]) {
  const { t } = useTranslation()
  const installedPlugins = useCatalogCache((state) => state.installed)
  const installedChanges = useCatalogCache((state) => state.installedChanges)
  const [enabledById, setEnabledById] = useState<Map<string, boolean>>(new Map())
  const notifyRestart = useRestartHint()

  const installed = useMemo(() => {
    const ids = new Set<string>()
    const enabled = new Map<string, boolean>()
    for (const plugin of installedPlugins ?? []) {
      ids.add(plugin.id)
      enabled.set(plugin.id, plugin.enabled)
    }
    for (const [id, change] of installedChanges) {
      if (change === 'remove') {
        ids.delete(id)
        enabled.delete(id)
      } else {
        ids.add(id)
        enabled.set(id, typeof change === 'boolean' ? change : true)
      }
    }
    return { ids, enabled }
  }, [installedPlugins, installedChanges])
  const homepagesById = usePluginHomepages(entries, installed.ids)
  const isEnabled = (entry: CatalogEntry) =>
    enabledById.get(entry.pluginId) ?? installed.enabled.get(entry.pluginId) ?? true

  const install = async (pluginId: string) => {
    await installPluginWithToast(pluginId, notifyRestart, t('settings.agent.plugins.installError'))
  }

  const toggle = async (entry: CatalogEntry) => {
    const enabled = !isEnabled(entry)
    setEnabledById((current) => new Map(current).set(entry.pluginId, enabled))
    try {
      await setAgentPluginEnabled(entry.pluginId, enabled)
      notifyRestart()
      updateInstalled(entry.pluginId, enabled)
    } catch {
      toast.add({ id: 'agent-plugin-toggle', title: t('settings.agent.saveError'), type: 'error' })
    } finally {
      setEnabledById((current) => {
        const next = new Map(current)
        next.delete(entry.pluginId)
        return next
      })
    }
  }

  const uninstall = async (pluginId: string) => {
    try {
      await removeAgentPlugin(pluginId)
      notifyRestart()
      updateInstalled(pluginId, 'remove')
    } catch {
      toast.add({
        id: 'agent-plugin-remove',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  const open = (entry: CatalogEntry) => {
    const homepage = homepagesById.get(entry.pluginId)
    if (homepage) {
      void requestFromDesktop('appOpenLink', { href: homepage, projectPath: '' })
    }
  }

  return { installedIds: installed.ids, homepagesById, isEnabled, install, toggle, uninstall, open }
}
