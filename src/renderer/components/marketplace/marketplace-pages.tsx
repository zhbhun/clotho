import { Download, Plus, Puzzle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'

import {
  type AgentMarketplaceInfo,
  type AgentMarketplacePlugin,
  addAgentMarketplace,
  listAgentAvailablePlugins,
  listAgentMarketplaces,
  refreshAgentMarketplace,
  removeAgentMarketplace,
} from '../../services/claude/agent-config'
import { requestFromDesktop } from '../../services/desktop/client'
import { tildePath } from '../../utils/path-display'
import { AppAlertDialog, AppAlertDialogContent } from '../app-dialog'
import { AgentEmpty } from './agent-shared'
import {
  refreshInstalled,
  refreshMarketplaces,
  updateMarketplaces,
  useCatalogCache,
} from './catalog-cache'
import { MarketplaceToolbar } from './marketplace-toolbar'
import { PluginAvatar } from './plugin-avatar'
import { DetailSection, PluginDetailIdentity, PluginInfoRows } from './plugin-detail-page'
import {
  PluginOverflowMenu,
  RowChevron,
  installPluginWithToast,
  useRestartHint,
} from './plugin-shared'
import { InstallPageSkeleton, MarketplaceDetailSkeleton } from './plugin-skeletons'
import { useSettingsDetailStore } from './settings-detail-store'
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

function marketplaceSource(marketplace: AgentMarketplaceInfo): string | undefined {
  const { repo, url, path } = marketplace.source
  return repo ?? url ?? (path ? tildePath(path) : undefined)
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
  const installed = useCatalogCache((state) => state.installed)
  const changes = useCatalogCache((state) => state.installedChanges)
  useEffect(() => {
    void refreshInstalled()
  }, [])
  return useMemo(() => {
    const ids = new Set((installed ?? []).map((plugin) => plugin.id))
    for (const [id, change] of changes) {
      if (change === 'remove') ids.delete(id)
      else ids.add(id)
    }
    return ids
  }, [installed, changes])
}

function openMarketplaceSource(marketplace: AgentMarketplaceInfo) {
  const { source, repo, url, path } = marketplace.source
  if (source === 'directory') {
    return requestFromDesktop('appOpenDirectory', { path: path ?? marketplace.installLocation })
  }
  const href = repo
    ? `https://github.com/${repo}`
    : url
        ?.replace(/^git@([^:]+):/, 'https://$1/')
        .replace(/^ssh:\/\/git@/, 'https://')
        .replace(/\.git$/, '')
  if (href) return requestFromDesktop('appOpenLink', { href, projectPath: '' })
}

/** Second-level Marketplaces page: registered sources with an Add action. */
export function MarketplaceListPage({ toolbar }: { toolbar?: HTMLElement | null } = {}) {
  const { t } = useTranslation()
  const marketplaces = useCatalogCache((state) => state.marketplaces)
  const marketplacesError = useCatalogCache((state) => state.marketplacesError)
  const openDetail = useSettingsDetailStore((state) => state.openDetail)

  useEffect(() => {
    void refreshMarketplaces()
  }, [])

  const openAdd = () =>
    openDetail(
      'agent-marketplace',
      null,
      t('settings.agent.plugins.addMarketplace'),
      'marketplaces',
    )

  return (
    <section className="flex flex-col gap-3" data-marketplace-list-page>
      <MarketplaceToolbar target={toolbar}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={t('settings.agent.plugins.addMarketplace')}
                className="text-foreground-subtle"
                size="icon"
                variant="ghost"
                onClick={openAdd}
              >
                <Plus aria-hidden strokeWidth={1.5} />
              </Button>
            }
          />
          <TooltipContent side="bottom">
            {t('settings.agent.plugins.addMarketplace')}
          </TooltipContent>
        </Tooltip>
      </MarketplaceToolbar>

      {marketplaces === null && !marketplacesError ? (
        <InstallPageSkeleton />
      ) : !marketplaces || marketplaces.length === 0 ? (
        <AgentEmpty />
      ) : (
        <div
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-lg:grid-cols-1 gap-x-6 gap-y-1"
          data-marketplace-tiles
        >
          {marketplaces.map((marketplace) => (
            <div
              className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
              data-marketplace-tile
              key={marketplace.name}
              onClick={() =>
                openDetail('agent-marketplace', marketplace.name, marketplace.name, 'marketplaces')
              }
            >
              <PluginAvatar name={marketplace.name} />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div
                  className="max-w-full cursor-pointer self-start truncate text-sm font-medium hover:underline underline-offset-4"
                  onClick={(event) => {
                    event.stopPropagation()
                    void openMarketplaceSource(marketplace)
                  }}
                >
                  {marketplace.name}
                </div>
                {marketplace.description ? (
                  <div className="truncate text-xs text-foreground-subtlest">
                    {marketplace.description}
                  </div>
                ) : null}
              </div>
              <RowChevron />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Third-level marketplace detail: source info plus that marketplace's plugins. */
export function MarketplaceDetailPage({ marketplaceName }: { marketplaceName: string }) {
  const requestLeave = useSettingsDetailStore((state) => state.requestLeave)
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
      updateMarketplaces(marketplaceName)
      // Leave first: the Marketplaces page remounts and fetches its own data.
      requestLeave()
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
        <MarketplaceDetailSkeleton />
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
      <div className="flex items-center justify-between gap-4">
        <PluginDetailIdentity name={marketplace.name} author={marketplace.owner} />
        <div className="flex shrink-0 items-center gap-2">
          <PluginOverflowMenu
            items={[
              {
                label: t('settings.agent.plugins.refresh'),
                onSelect: () => void handleRefresh(),
              },
              {
                label: t('settings.agent.plugins.uninstall'),
                onSelect: () => setIsRemoveConfirmOpen(true),
                destructive: true,
              },
            ]}
            label={t('settings.agent.plugins.more')}
          />
        </div>
      </div>

      {marketplace.description ? (
        <p className="text-sm text-foreground-subtlest">{marketplace.description}</p>
      ) : null}

      <DetailSection count={entries.length} title={t('settings.agent.title.plugins')}>
        {entries.length === 0 ? (
          <AgentEmpty />
        ) : (
          <div className="flex flex-col pt-1">
            {entries.map((entry) => (
              <div
                className="flex items-center gap-4 py-3"
                data-marketplace-plugin
                key={entry.pluginId}
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted opacity-80">
                  <Puzzle className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{entry.name}</div>
                  {entry.description ? (
                    <div className="truncate text-foreground-subtlest">{entry.description}</div>
                  ) : null}
                  {typeof entry.installCount === 'number' ? (
                    <div className="flex items-center gap-1 text-xs text-foreground-subtlest">
                      <Download className="size-3" /> {entry.installCount.toLocaleString()}
                    </div>
                  ) : null}
                </div>
                {installedIds.has(entry.pluginId) ? (
                  <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
                ) : (
                  <Button
                    aria-label={t('settings.agent.plugins.install')}
                    className="text-foreground-subtlest"
                    size="icon"
                    variant="ghost"
                    onClick={() =>
                      void installPluginWithToast(
                        entry.pluginId,
                        notifyRestart,
                        t('settings.agent.plugins.installError'),
                      )
                    }
                  >
                    <Plus />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DetailSection>
      <DetailSection title={t('settings.agent.plugins.info')}>
        <PluginInfoRows
          rows={[
            { key: t('settings.agent.plugins.author'), value: marketplace.owner },
            { key: t('settings.agent.plugins.type'), value: marketplace.source.source },
            {
              key: t('settings.agent.plugins.source'),
              value: marketplaceSource(marketplace) ?? marketplace.source.source,
            },
          ]}
        />
      </DetailSection>
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
  const setDirty = useSettingsDetailStore((state) => state.setDirty)
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
      setDirty(false)
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
