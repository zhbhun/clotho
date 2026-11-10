import { RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shadcn/alert-dialog'
import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'

import { AppAlertDialog, AppAlertDialogContent } from '../../../components/app-dialog'
import {
  type AgentMarketplaceInfo,
  type AgentMarketplacePlugin,
  addAgentMarketplace,
  listAgentAvailablePlugins,
  listAgentMarketplaces,
  listAgentPlugins,
  refreshAgentMarketplace,
  removeAgentMarketplace,
} from '../../../services/claude/agent-config'
import { AgentEmpty } from './agent-shared'
import { updateMarketplaces } from './catalog-cache'
import {
  PluginOverflowMenu,
  RowChevron,
  installPluginWithToast,
  refreshAllMarketplaces,
  useRestartHint,
} from './plugin-shared'
import { useSettingsDetailStore } from './settings-detail-store'
import { SettingsList, SettingsRow } from './settings-list'
import { useDetailDirty } from './use-detail-dirty'

/**
 * Whether a marketplace source should offer the Git ref field: a GitHub
 * `owner/repo` shorthand or a `git@`/`https://` URL, never a local path.
 */
export function isRepoLike(value: string): boolean {
  const source = value.trim()
  if (!source || source.startsWith('/') || source.startsWith('~') || source.startsWith('./')) {
    return false
  }
  return /^(git@[\w.-]+:|https?:\/\/)[\w.-]+/.test(source) || /^[\w.-]+\/[\w.-]+/.test(source)
}

function useMarketplaces() {
  const { t } = useTranslation()
  const [marketplaces, setMarketplaces] = useState<AgentMarketplaceInfo[]>([])
  const [catalog, setCatalog] = useState<AgentMarketplacePlugin[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const reload = async () => {
    try {
      const [list, available] = await Promise.all([
        listAgentMarketplaces(),
        listAgentAvailablePlugins(),
      ])
      setMarketplaces(list)
      setCatalog(available)
    } catch {
      toast.add({
        id: 'agent-marketplaces-load',
        title: t('settings.agent.loadError'),
        type: 'error',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return { marketplaces, catalog, isLoading, reload }
}

function useInstalledPluginIds() {
  const [ids, setIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    let cancelled = false
    listAgentPlugins()
      .then((plugins) => {
        if (!cancelled) setIds(new Set(plugins.map((plugin) => plugin.id)))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])
  return ids
}

/** Second-level Marketplaces page: registered sources with Add and a `⋯` menu. */
export function MarketplaceListPage() {
  const { t } = useTranslation()
  const { marketplaces, isLoading, reload } = useMarketplaces()
  const openDetail = useSettingsDetailStore((state) => state.openDetail)

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefreshAll = () =>
    refreshAllMarketplaces(reload, t('settings.agent.plugins.refreshError'))

  const openAdd = () =>
    openDetail(
      'agent-marketplace',
      null,
      t('settings.agent.plugins.addMarketplace'),
      'marketplaces',
    )

  return (
    <section className="flex flex-col gap-3" data-marketplace-list-page>
      <div className="flex min-h-7 items-center justify-between gap-4">
        <h2 className="text-sm font-medium">
          {t('settings.agent.plugins.registered')}{' '}
          <span className="text-foreground-subtlest">
            {t('settings.agent.subagent.itemCount', { count: marketplaces.length })}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={openAdd}>
            {t('settings.agent.plugins.addMarketplace')}
          </Button>
          <PluginOverflowMenu
            items={[
              {
                label: t('settings.agent.plugins.refreshAll'),
                onSelect: () => void handleRefreshAll(),
              },
            ]}
            label={t('settings.agent.plugins.more')}
          />
        </div>
      </div>

      {isLoading ? (
        <Spinner className="self-center" />
      ) : marketplaces.length === 0 ? (
        <AgentEmpty />
      ) : (
        <SettingsList>
          {marketplaces.map((marketplace) => (
            <SettingsRow
              className="gap-3 cursor-pointer transition-colors hover:bg-muted"
              key={marketplace.name}
              variant="compact"
              onClick={() =>
                openDetail('agent-marketplace', marketplace.name, marketplace.name, 'marketplaces')
              }
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-normal">{marketplace.name}</div>
                <div className="truncate text-sm text-foreground-subtlest">
                  {[marketplace.source.source, marketplace.source.repo ?? marketplace.source.url]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              <RowChevron />
            </SettingsRow>
          ))}
        </SettingsList>
      )}
    </section>
  )
}

/** Third-level marketplace detail: source info plus that marketplace's plugins. */
export function MarketplaceDetailPage({ marketplaceName }: { marketplaceName: string }) {
  const { t } = useTranslation()
  const { marketplaces, catalog, isLoading, reload } = useMarketplaces()
  const notifyRestart = useRestartHint()
  const marketplace = marketplaces.find((entry) => entry.name === marketplaceName)
  const entries = catalog.filter((entry) => entry.marketplaceName === marketplaceName)
  const installedIds = useInstalledPluginIds()

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRefresh = async () => {
    try {
      await refreshAgentMarketplace(marketplaceName)
      updateMarketplaces()
      await reload()
    } catch {
      toast.add({
        id: 'agent-marketplace-refresh',
        title: t('settings.agent.plugins.refreshError'),
        type: 'error',
      })
    }
  }

  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false)

  const handleRemove = async () => {
    try {
      await removeAgentMarketplace(marketplaceName)
      updateMarketplaces()
      // Leave first: the Marketplaces page remounts and fetches its own data.
      useSettingsDetailStore.getState().requestLeave()
    } catch {
      toast.add({
        id: 'agent-marketplace-remove',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  if (isLoading) {
    return (
      <section className="flex flex-col gap-4" data-marketplace-detail-page>
        <Spinner className="self-center" />
      </section>
    )
  }
  if (!marketplace) {
    return (
      <section className="flex flex-col gap-4" data-marketplace-detail-page>
        <AgentEmpty />
      </section>
    )
  }

  return (
    <section className="flex flex-col gap-5" data-marketplace-detail-page>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-medium tracking-tight">{marketplace.name}</h1>
          <p className="mt-1 text-sm text-foreground-subtlest">
            {[marketplace.source.source, marketplace.source.repo ?? marketplace.source.url]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            aria-label={t('settings.agent.plugins.refresh')}
            size="icon-sm"
            variant="outline"
            onClick={() => void handleRefresh()}
          >
            <RefreshCw className="size-4" />
          </Button>
          <PluginOverflowMenu
            items={[
              {
                label: t('settings.agent.plugins.removeMarketplace'),
                onSelect: () => setIsRemoveConfirmOpen(true),
                destructive: true,
              },
            ]}
            label={t('settings.agent.plugins.more')}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('settings.agent.plugins.info')}</h3>
        <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
          <div className="grid grid-cols-[110px_1fr] gap-4 text-sm">
            <span className="text-foreground-subtlest">{t('settings.agent.plugins.type')}</span>
            <span className="min-w-0 truncate text-sm font-normal">
              {marketplace.source.source}
            </span>
          </div>
          <div className="grid grid-cols-[110px_1fr] gap-4 text-sm">
            <span className="text-foreground-subtlest">{t('settings.agent.plugins.source')}</span>
            <span className="min-w-0 truncate text-sm font-normal">
              {marketplace.source.repo ?? marketplace.source.url ?? marketplace.source.source}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          {t('settings.agent.title.plugins')}
          <span className="text-foreground-subtlest">{entries.length}</span>
        </h3>
        {entries.length === 0 ? (
          <AgentEmpty />
        ) : (
          <SettingsList>
            {entries.map((entry) => (
              <SettingsRow className="gap-3" key={entry.pluginId} variant="compact">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-normal">{entry.name}</span>
                    {typeof entry.installCount === 'number' ? (
                      <Badge variant="secondary">
                        {t('settings.agent.plugins.installCount', { count: entry.installCount })}
                      </Badge>
                    ) : null}
                  </div>
                  {entry.description ? (
                    <div className="truncate text-sm text-foreground-subtle">
                      {entry.description}
                    </div>
                  ) : null}
                </div>
                {installedIds.has(entry.pluginId) ? (
                  <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void installPluginWithToast(
                        entry.pluginId,
                        notifyRestart,
                        t('settings.agent.plugins.installError'),
                      )
                    }
                  >
                    {t('settings.agent.plugins.install')}
                  </Button>
                )}
              </SettingsRow>
            ))}
          </SettingsList>
        )}
      </div>
      <AppAlertDialog onOpenChange={setIsRemoveConfirmOpen} open={isRemoveConfirmOpen}>
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.agent.plugins.removeMarketplaceTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.agent.plugins.removeMarketplaceDescription', { name: marketplaceName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('settings.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsRemoveConfirmOpen(false)
                void handleRemove()
              }}
            >
              {t('settings.agent.plugins.removeMarketplace')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AppAlertDialog>
    </section>
  )
}

/** Third-level Add marketplace page: Source + conditional Git ref. */
export function MarketplaceAddPage() {
  const { t } = useTranslation()
  const [source, setSource] = useState('')
  const [ref, setRef] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const requestLeave = useSettingsDetailStore((state) => state.requestLeave)
  // The shared dirty guard: typed form values gate list-bound navigation
  // behind the discard dialog (spec: Add marketplace form).
  useDetailDirty({ source, ref })

  const isRepoSource = isRepoLike(source)

  const handleAdd = async () => {
    const trimmed = source.trim()
    if (!trimmed) return
    const composed = isRepoSource && ref.trim() ? `${trimmed}#${ref.trim()}` : trimmed
    setIsAdding(true)
    try {
      await addAgentMarketplace(composed)
      updateMarketplaces()
      useSettingsDetailStore.getState().setDirty(false)
      requestLeave()
    } catch {
      toast.add({
        id: 'agent-marketplace-add',
        title: t('settings.agent.plugins.marketplaceError'),
        type: 'error',
      })
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <section className="flex flex-col gap-4" data-marketplace-add-page>
      <div>
        <h1 className="text-xl font-medium tracking-tight">
          {t('settings.agent.plugins.addMarketplace')}
        </h1>
        <p className="mt-1 text-sm text-foreground-subtlest">
          {t('settings.agent.plugins.addPageDescription')}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="marketplace-source">
            {t('settings.agent.plugins.source')}
          </label>
          <Input
            id="marketplace-source"
            placeholder={t('settings.agent.plugins.sourcePlaceholder')}
            value={source}
            onChange={(event) => setSource(event.target.value)}
          />
          <p className="mt-1 text-xs text-foreground-subtlest">
            {t('settings.agent.plugins.sourceHint')}
          </p>
        </div>

        {isRepoSource ? (
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="marketplace-ref">
              {t('settings.agent.plugins.gitRefOptional')}
            </label>
            <Input
              id="marketplace-ref"
              placeholder="main"
              value={ref}
              onChange={(event) => setRef(event.target.value)}
            />
            <p className="mt-1 text-xs text-foreground-subtlest">
              {t('settings.agent.plugins.gitRefHint')}
            </p>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={requestLeave}>
            {t('settings.common.cancel')}
          </Button>
          <Button disabled={isAdding || !source.trim()} onClick={() => void handleAdd()}>
            {isAdding ? <Spinner /> : null}
            {t('settings.agent.plugins.addMarketplaceAction')}
          </Button>
        </div>
      </div>
    </section>
  )
}
