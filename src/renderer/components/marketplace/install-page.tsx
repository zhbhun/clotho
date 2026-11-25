import { ArrowDownUp, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Separator } from '@/shadcn/separator'
import { toast } from '@/shadcn/toast'

import { getAgentPluginDetails } from '../../services/claude/agent-config'
import { requestFromDesktop } from '../../services/desktop/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../dropdown-menu'
import { AgentEmpty } from './agent-shared'
import {
  refreshCatalog,
  refreshInstalled,
  refreshMarketplaces,
  useCatalogCache,
} from './catalog-cache'
import { type CatalogSection, catalogSections } from './catalog-sections'
import {
  type CatalogEntry,
  type CatalogSort,
  catalogSorts,
  orderCatalog,
  searchCatalog,
} from './install-catalog'
import { InstallGrid } from './install-grid'
import { MarketplaceToolbar } from './marketplace-toolbar'
import {
  DetailSection,
  PluginDetailIdentity,
  PluginDetailSections,
  PluginInfoRows,
} from './plugin-detail-page'
import { installPluginWithToast, useRestartHint } from './plugin-shared'
import { InstallPageSkeleton, PluginDetailSkeleton } from './plugin-skeletons'
import { useSettingsDetailStore } from './settings-detail-store'
import { useInstallActions } from './use-install-actions'

const INSTALL_PAGE_SIZE = 100

/** Section previews by default; full catalogs stay available through search. */
export function InstallPluginPage({ toolbar }: { toolbar?: HTMLElement | null } = {}) {
  const { t } = useTranslation()
  const catalog = useCatalogCache((state) => state.catalog)
  const catalogLoading = useCatalogCache((state) => state.catalogLoading)
  const catalogError = useCatalogCache((state) => state.catalogError)
  const view = useSettingsDetailStore((state) => state.view)
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const openSub = useSettingsDetailStore((state) => state.openSub)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<CatalogSort>('downloadsDesc')
  const [renderLimit, setRenderLimit] = useState(INSTALL_PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const sectionId =
    view.kind === 'detail' &&
    view.categoryId === 'agent-marketplace' &&
    view.page === 'install-section'
      ? view.file
      : null
  const isSearching = search.trim().length > 0
  const isGrouped = !sectionId && !isSearching

  useEffect(() => {
    void refreshCatalog()
    void refreshInstalled()
  }, [])

  const entries = useMemo(
    () =>
      orderCatalog([...new Map((catalog ?? []).map((entry) => [entry.pluginId, entry])).values()]),
    [catalog],
  )
  const sections = useMemo(() => catalogSections(entries), [entries])
  const section = sections.find((entry) => entry.id === sectionId)
  const marketplaceName = section?.kind === 'marketplace' ? section.marketplaceName : undefined
  const marketplace = useCatalogCache((state) =>
    marketplaceName ? state.marketplaces?.find((item) => item.name === marketplaceName) : undefined,
  )
  useEffect(() => {
    if (marketplaceName && useCatalogCache.getState().marketplaces === null)
      void refreshMarketplaces()
  }, [marketplaceName])

  const groups = sections
  const orderedEntries = useMemo(
    () => (sectionId ? orderCatalog(section?.entries ?? [], sort) : entries),
    [sectionId, section, sort, entries],
  )
  const rows = useMemo(() => searchCatalog(orderedEntries, search), [orderedEntries, search])
  const ranks = useMemo(
    () =>
      section?.kind === 'popular'
        ? new Map(section.entries.map((entry, index) => [entry.pluginId, index + 1]))
        : undefined,
    [section],
  )
  const shown = useMemo(() => rows.slice(0, renderLimit), [rows, renderLimit])
  const visibleEntries = useMemo(
    () =>
      isGrouped ? groups.flatMap((group) => group.entries.slice(0, group.previewLimit)) : shown,
    [isGrouped, groups, shown],
  )
  const actions = useInstallActions(visibleEntries)
  const hasMore = !isGrouped && rows.length > renderLimit
  const isEmpty = isGrouped ? groups.length === 0 : shown.length === 0
  const sectionTitle = (group: CatalogSection) =>
    group.kind === 'marketplace'
      ? group.marketplaceName
      : group.kind === 'popular'
        ? t('settings.agent.plugins.popular')
        : t(`settings.agent.plugins.categories.${group.category}`)

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!hasMore || !sentinel) return
    const observer = new IntersectionObserver((observerEntries) => {
      if (observerEntries.some((entry) => entry.isIntersecting)) {
        setRenderLimit((current) => current + INSTALL_PAGE_SIZE)
      }
    })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore])

  const handleDetails = (entry: CatalogEntry, group?: CatalogSection) => {
    if (group) {
      openDetail('agent-marketplace', group.id, sectionTitle(group), 'install-section')
    }
    if (group || sectionId)
      openSub('agent-marketplace', 'install-detail', entry.pluginId, entry.name)
    else openDetail('agent-marketplace', entry.pluginId, entry.name, 'install')
  }

  return (
    <section className="flex flex-col gap-4" data-install-page>
      <MarketplaceToolbar target={toolbar}>
        <Input
          className="w-60 max-w-full"
          placeholder={t('settings.agent.plugins.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setRenderLimit(INSTALL_PAGE_SIZE)
          }}
        />
        {sectionId && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" />}
              aria-label={t('settings.agent.plugins.sort')}
              title={t('settings.agent.plugins.sort')}
            >
              <ArrowDownUp />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-max">
              <DropdownMenuRadioGroup
                value={sort}
                onValueChange={(value: CatalogSort) => {
                  setSort(value)
                  setRenderLimit(INSTALL_PAGE_SIZE)
                }}
              >
                {catalogSorts.map((option) => (
                  <DropdownMenuRadioItem closeOnClick key={option} value={option}>
                    {t(`settings.agent.plugins.sortOptions.${option}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </MarketplaceToolbar>
      {section ? (
        <header className="space-y-1 px-2">
          <h1 className="text-xl font-semibold tracking-tight">{sectionTitle(section)}</h1>
          {marketplace?.description && (
            <p className="text-sm text-foreground-subtle">{marketplace.description}</p>
          )}
          {marketplace?.owner && (
            <p className="text-xs text-foreground-subtlest">
              {t('settings.agent.plugins.byAuthor', { author: marketplace.owner })}
            </p>
          )}
        </header>
      ) : null}
      {catalog === null && (catalogLoading || !catalogError) ? (
        <InstallPageSkeleton />
      ) : isEmpty ? (
        <AgentEmpty />
      ) : (
        <div className="flex flex-col gap-8" data-install-list>
          {isGrouped ? (
            groups.map((group) => (
              <section
                className="flex flex-col gap-2"
                data-catalog-section={group.id}
                key={group.id}
              >
                <div className="flex flex-col gap-2">
                  <div
                    className="flex w-fit cursor-pointer items-center gap-1 px-2"
                    onClick={() => {
                      setRenderLimit(INSTALL_PAGE_SIZE)
                      openDetail(
                        'agent-marketplace',
                        group.id,
                        sectionTitle(group),
                        'install-section',
                      )
                    }}
                  >
                    <h2 className="text-lg font-semibold tracking-tight">{sectionTitle(group)}</h2>
                    <ChevronRight
                      aria-hidden
                      className="size-4 translate-y-px text-foreground-subtlest/60"
                    />
                  </div>
                  <Separator />
                </div>
                <InstallGrid
                  entries={group.entries.slice(0, group.previewLimit)}
                  actions={actions}
                  isRanked={group.kind === 'popular'}
                  onDetails={(entry) => handleDetails(entry, group)}
                />
              </section>
            ))
          ) : (
            <InstallGrid
              entries={shown}
              actions={actions}
              ranks={ranks}
              onDetails={handleDetails}
            />
          )}
          {hasMore ? <div data-install-sentinel ref={sentinelRef} /> : null}
        </div>
      )}
    </section>
  )
}

/** Third-level install detail: sectioned layout (variant A) with an Install action. */
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

  const openLink = (href: string) =>
    void requestFromDesktop('appOpenLink', { href, projectPath: '' })

  if (!details) {
    return (
      <section className="flex flex-col gap-4" data-install-detail-page>
        <PluginDetailSkeleton />
      </section>
    )
  }

  const info: { key: string; value?: string | number; link?: string }[] = [
    { key: t('settings.agent.plugins.author'), value: details.author },
    { key: t('settings.agent.plugins.category'), value: details.category },
    { key: t('settings.agent.plugins.version'), value: details.version },
    {
      key: t('settings.agent.plugins.homepage'),
      value: details.homepage,
      link: details.homepage,
    },
    { key: t('settings.agent.plugins.marketplace'), value: details.marketplace },
    { key: t('settings.agent.plugins.installs'), value: details.installCount?.toLocaleString() },
  ]

  return (
    <section className="flex flex-col gap-5" data-install-detail-page>
      <div className="flex items-center justify-between gap-4">
        <PluginDetailIdentity
          author={details.author}
          category={details.category}
          displayName={details.displayName}
          name={details.name}
        />
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
      {details.description ? (
        <p className="text-sm text-foreground-subtlest">{details.description}</p>
      ) : null}

      <PluginDetailSections details={details} />

      <DetailSection title={t('settings.agent.plugins.info')}>
        <PluginInfoRows rows={info} onOpenLink={openLink} />
      </DetailSection>
    </section>
  )
}
