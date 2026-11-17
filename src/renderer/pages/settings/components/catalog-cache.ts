import { create } from 'zustand'

import { toast } from '@/shadcn/toast'

import { appI18n } from '../../../i18n/runtime'
import {
  type AgentMarketplaceInfo,
  type AgentMarketplacePlugin,
  type AgentPluginInfo,
  listAgentAvailablePlugins,
  listAgentMarketplaces,
  listAgentPlugins,
} from '../../../services/claude/agent-config'

type InstalledChange = 'install' | 'remove' | boolean

interface CatalogCache {
  catalog: AgentMarketplacePlugin[] | null
  installed: AgentPluginInfo[] | null
  installedChanges: Map<string, InstalledChange>
  catalogLoading: boolean
  catalogError: boolean
  installedError: boolean
  marketplaces: AgentMarketplaceInfo[] | null
  marketplacesError: boolean
}

export const useCatalogCache = create<CatalogCache>(() => ({
  catalog: null,
  installed: null,
  installedChanges: new Map(),
  catalogLoading: false,
  catalogError: false,
  installedError: false,
  marketplaces: null,
  marketplacesError: false,
}))

let catalogGeneration = 0
let installedGeneration = 0
let marketplacesGeneration = 0

function reportLoadError() {
  toast.add({
    id: 'agent-catalog-load',
    title: appI18n.t('settings.agent.loadError'),
    type: 'error',
  })
}

export async function refreshCatalog() {
  const generation = ++catalogGeneration
  useCatalogCache.setState({ catalogLoading: true, catalogError: false })
  try {
    const catalog = await listAgentAvailablePlugins()
    if (generation === catalogGeneration) useCatalogCache.setState({ catalog, catalogError: false })
  } catch {
    if (generation === catalogGeneration) {
      useCatalogCache.setState({ catalogError: true })
      reportLoadError()
    }
  } finally {
    if (generation === catalogGeneration) useCatalogCache.setState({ catalogLoading: false })
  }
}

export async function refreshInstalled() {
  const generation = ++installedGeneration
  useCatalogCache.setState({ installedError: false })
  try {
    const installed = await listAgentPlugins()
    if (generation === installedGeneration)
      useCatalogCache.setState({ installed, installedChanges: new Map(), installedError: false })
  } catch {
    if (generation === installedGeneration) {
      useCatalogCache.setState({ installedError: true })
      reportLoadError()
    }
  }
}

export async function refreshMarketplaces() {
  const generation = ++marketplacesGeneration
  useCatalogCache.setState({ marketplacesError: false })
  try {
    const marketplaces = await listAgentMarketplaces()
    if (generation === marketplacesGeneration)
      useCatalogCache.setState({ marketplaces, marketplacesError: false })
  } catch {
    if (generation === marketplacesGeneration) {
      useCatalogCache.setState({ marketplacesError: true })
      reportLoadError()
    }
  }
}

export function updateInstalled(id: string, change: InstalledChange) {
  installedGeneration++
  const current = useCatalogCache.getState().installed
  if (current) {
    const existing = current.find((plugin) => plugin.id === id)
    let installed = current.filter((plugin) => plugin.id !== id)
    if (change !== 'remove') {
      const at = id.lastIndexOf('@')
      const plugin = existing ?? {
        id,
        name: at > 0 ? id.slice(0, at) : id,
        marketplace: at > 0 ? id.slice(at + 1) : '',
        version: '',
        scope: '',
        installPath: '',
        enabled: true,
      }
      installed = [
        ...installed,
        { ...plugin, enabled: typeof change === 'boolean' ? change : true },
      ]
    }
    useCatalogCache.setState({ installed })
  } else {
    const installedChanges = new Map(useCatalogCache.getState().installedChanges)
    installedChanges.set(id, change)
    useCatalogCache.setState({ installedChanges })
  }
  void refreshInstalled()
}

export function updateMarketplaces(removedName?: string) {
  catalogGeneration++
  installedGeneration++
  marketplacesGeneration++
  const marketplaces = useCatalogCache.getState().marketplaces
  if (removedName && marketplaces)
    useCatalogCache.setState({
      marketplaces: marketplaces.filter((entry) => entry.name !== removedName),
    })
  void refreshCatalog()
  void refreshInstalled()
  void refreshMarketplaces()
}
