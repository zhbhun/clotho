import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Spinner } from '@/shadcn/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/shadcn/tabs'
import { toast } from '@/shadcn/toast'

import {
  type AgentMarketplaceInfo,
  type AgentMarketplacePlugin,
  getAgentPluginDetails,
  listAgentAvailablePlugins,
  listAgentMarketplaces,
  listAgentPlugins,
} from '../../../services/claude/agent-config'
import { AgentEmpty } from './agent-shared'
import { PluginDetailSections, PluginInfoRows } from './plugin-detail-page'
import { installPluginWithToast, useRestartHint } from './plugin-shared'
import { useSettingsDetailStore } from './settings-detail-store'

async function listInstalledOnce(): Promise<Set<string>> {
  try {
    const plugins = await listAgentPlugins()
    return new Set(plugins.map((plugin) => plugin.id))
  } catch {
    return new Set()
  }
}

type CatalogTab = 'public' | 'community' | 'personal'

const DIRECTORY_MARKETPLACE = 'anthropic-plugin-directory'

function tabForMarketplace(sourceType: string | undefined, name: string): CatalogTab {
  if (name === DIRECTORY_MARKETPLACE) return 'public'
  if (sourceType === 'directory') return 'personal'
  return 'community'
}

/**
 * Second-level Install page: Public/Community/Personal tabs over the catalog,
 * search at the row's right end, borderless two-column grid.
 */
export function InstallPluginPage() {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<AgentMarketplacePlugin[]>([])
  const [sources, setSources] = useState<Map<string, string | undefined>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [tab, setTab] = useState<CatalogTab>('public')
  const [search, setSearch] = useState('')
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set())
  const openSub = useSettingsDetailStore((state) => state.openSub)
  const notifyRestart = useRestartHint()

  useEffect(() => {
    let cancelled = false
    Promise.all([listAgentAvailablePlugins(), listAgentMarketplaces()])
      .then(([available, marketplaces]) => {
        if (cancelled) return
        setCatalog(available)
        setSources(
          new Map(
            marketplaces.map((entry: AgentMarketplaceInfo) => [entry.name, entry.source.source]),
          ),
        )
      })
      .catch(() => {
        if (!cancelled) {
          toast.add({
            id: 'agent-catalog-load',
            title: t('settings.agent.loadError'),
            type: 'error',
          })
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    listInstalledOnce().then((ids) => {
      if (!cancelled) setInstalledIds(ids)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return catalog.filter((entry) => {
      if (tabForMarketplace(sources.get(entry.marketplaceName), entry.marketplaceName) !== tab) {
        return false
      }
      if (!query) return true
      return (
        entry.name.toLowerCase().includes(query) ||
        (entry.description ?? '').toLowerCase().includes(query) ||
        entry.marketplaceName.toLowerCase().includes(query)
      )
    })
  }, [catalog, sources, tab, search])

  const handleInstall = async (pluginId: string) => {
    const ok = await installPluginWithToast(
      pluginId,
      notifyRestart,
      t('settings.agent.plugins.installError'),
    )
    if (ok) setInstalledIds((current) => new Set(current).add(pluginId))
  }

  return (
    <section className="flex flex-col gap-4" data-install-page>
      <div>
        <h1 className="text-xl font-medium tracking-tight">
          {t('settings.agent.plugins.installPageTitle')}
        </h1>
        <p className="mt-1 text-sm text-foreground-subtlest">
          {t('settings.agent.plugins.installPageDescription')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Tabs onValueChange={(value) => setTab(value as CatalogTab)} value={tab}>
          <TabsList>
            <TabsTrigger value="public">{t('settings.agent.plugins.tabPublic')}</TabsTrigger>
            <TabsTrigger value="community">{t('settings.agent.plugins.tabCommunity')}</TabsTrigger>
            <TabsTrigger value="personal">{t('settings.agent.plugins.tabPersonal')}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input
          className="w-60"
          placeholder={t('settings.agent.plugins.searchPlaceholder')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {isLoading ? (
        <Spinner className="self-center" />
      ) : rows.length === 0 ? (
        <AgentEmpty />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-0.5 md:grid-cols-2" data-install-grid>
          {rows.map((entry) => (
            <div
              className="flex min-h-12 items-center gap-2 rounded-lg px-2 hover:bg-muted/50"
              data-install-tile
              key={entry.pluginId}
              onClick={() => openSub('agent-plugins', 'install-detail', entry.pluginId, entry.name)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-normal">{entry.name}</div>
                <div className="truncate text-sm text-foreground-subtle">
                  {[
                    typeof entry.installCount === 'number'
                      ? t('settings.agent.plugins.installCount', { count: entry.installCount })
                      : entry.marketplaceName,
                    entry.description,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {installedIds.has(entry.pluginId) ? (
                <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
              ) : (
                <Button
                  aria-label={t('settings.agent.plugins.install')}
                  className="text-foreground-subtlest"
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleInstall(entry.pluginId)
                  }}
                  size="icon-sm"
                  variant="ghost"
                >
                  +
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Third-level install detail: same layout as plugin detail with an Install action. */
export function InstallPluginDetailPage({ pluginId }: { pluginId: string }) {
  const { t } = useTranslation()
  const requestLeave = useSettingsDetailStore((state) => state.requestLeave)
  const notifyRestart = useRestartHint()
  const [details, setDetails] = useState<Awaited<ReturnType<typeof getAgentPluginDetails>> | null>(
    null,
  )
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAgentPluginDetails(pluginId)
      .then((result) => {
        if (!cancelled) {
          setDetails(result)
          setInstalled(result.installed)
        }
      })
      .catch(() => {
        if (!cancelled) {
          toast.add({
            id: 'agent-plugin-details',
            title: t('settings.agent.plugins.notFound'),
            type: 'error',
          })
          requestLeave()
        }
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId])

  const handleInstall = async () => {
    const ok = await installPluginWithToast(
      pluginId,
      notifyRestart,
      t('settings.agent.plugins.installError'),
    )
    if (ok) setInstalled(true)
  }

  if (!details) {
    return (
      <section className="flex flex-col gap-4" data-install-detail-page>
        <Spinner className="self-center" />
      </section>
    )
  }

  const info: { key: string; value?: string | number }[] = [
    { key: t('settings.agent.plugins.author'), value: details.author },
    { key: t('settings.agent.plugins.version'), value: details.version },
    { key: t('settings.agent.plugins.marketplace'), value: details.marketplace },
    { key: t('settings.agent.plugins.installs'), value: details.installCount },
  ]

  return (
    <section className="flex flex-col gap-5" data-install-detail-page>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-medium tracking-tight">{details.name}</h1>
          {details.description ? (
            <p className="mt-1 text-sm text-foreground-subtlest">{details.description}</p>
          ) : null}
        </div>
        <div className="shrink-0">
          {installed ? (
            <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
          ) : (
            <Button onClick={() => void handleInstall()}>
              {t('settings.agent.plugins.install')}
            </Button>
          )}
        </div>
      </div>

      <PluginDetailSections details={details} />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('settings.agent.plugins.info')}</h3>
        <PluginInfoRows rows={info} />
      </div>
    </section>
  )
}
