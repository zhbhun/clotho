import { Download, EllipsisVertical, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/select'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/dropdown-menu'
import {
  type AgentMarketplacePlugin,
  getAgentPluginDetails,
  listAgentAvailablePlugins,
  listAgentPlugins,
  removeAgentPlugin,
  setAgentPluginEnabled,
} from '../../../services/claude/agent-config'
import { requestFromDesktop } from '../../../services/desktop/client'
import { AgentEmpty } from './agent-shared'
import {
  type CatalogEntry,
  catalogSources,
  dedupeCatalog,
  installedName,
  orderCatalog,
} from './install-catalog'
import { PluginDetailSections, PluginInfoRows } from './plugin-detail-page'
import { installPluginWithToast, useRestartHint } from './plugin-shared'
import { useSettingsDetailStore } from './settings-detail-store'
import { usePluginHomepages } from './use-plugin-homepages'

const INSTALL_PAGE_SIZE = 100

/** Install records from the CLI plus per-name enabled state. */
interface InstalledRecords {
  names: Set<string>
  /** Verbatim `<name>@<marketplace>` install records. */
  ids: Set<string>
  enabled: Map<string, boolean>
}

const NO_INSTALLS: InstalledRecords = {
  names: new Set(),
  ids: new Set(),
  enabled: new Map(),
}

async function listInstalledOnce(): Promise<InstalledRecords> {
  try {
    const plugins = await listAgentPlugins()
    const names = new Set<string>()
    const ids = new Set<string>()
    const enabled = new Map<string, boolean>()
    for (const plugin of plugins) {
      const name = installedName(plugin.id)
      names.add(name)
      ids.add(plugin.id)
      enabled.set(name, plugin.enabled)
    }
    return { names, ids, enabled }
  } catch {
    return NO_INSTALLS
  }
}

/**
 * Second-level Install page (Marketplace): one deduplicated list over the whole
 * catalog, `All` source filter + search at the toolbar, three-line rows rendered
 * incrementally (a sentinel appends the next page near the viewport end).
 */
export function InstallPluginPage() {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<AgentMarketplacePlugin[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [sourceFilter, setSourceFilter] = useState('')
  const [search, setSearch] = useState('')
  const [installed, setInstalled] = useState<InstalledRecords>(NO_INSTALLS)
  const [enabledById, setEnabledById] = useState<Map<string, boolean>>(new Map())
  const [renderLimit, setRenderLimit] = useState(INSTALL_PAGE_SIZE)
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const notifyRestart = useRestartHint()
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    listAgentAvailablePlugins()
      .then((available) => {
        if (cancelled) return
        setCatalog(available)
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
    listInstalledOnce().then((state) => {
      if (cancelled) return
      setInstalled(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const entries = useMemo(
    () => orderCatalog(dedupeCatalog(catalog, installed)),
    [catalog, installed],
  )
  const homepagesById = usePluginHomepages(entries, installed.names)

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return entries.filter((entry) => {
      if (sourceFilter && entry.marketplaceName !== sourceFilter) return false
      if (!query) return true
      return (
        entry.name.toLowerCase().includes(query) ||
        (entry.description ?? '').toLowerCase().includes(query) ||
        entry.marketplaceName.toLowerCase().includes(query)
      )
    })
  }, [entries, sourceFilter, search])

  const visibleSources = useMemo(() => catalogSources(entries), [entries])
  const sourceItems = useMemo(
    () => [
      { value: '', label: t('settings.agent.plugins.allSources') },
      ...visibleSources.map((market) => ({ value: market, label: market })),
    ],
    [visibleSources, t],
  )
  // Optimistic menu state wins, then the CLI's install record, then enabled.
  const isEntryEnabled = (entry: CatalogEntry) =>
    enabledById.get(entry.pluginId) ?? installed.enabled.get(entry.name) ?? true
  const shown = rows.slice(0, renderLimit)
  const hasMore = rows.length > renderLimit

  // Append the next page when the sentinel scrolls near the viewport end.
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

  const handleInstall = async (pluginId: string) => {
    const ok = await installPluginWithToast(
      pluginId,
      notifyRestart,
      t('settings.agent.plugins.installError'),
    )
    if (ok) {
      const name = installedName(pluginId)
      setInstalled((current) => ({
        names: new Set(current.names).add(name),
        ids: new Set(current.ids).add(pluginId),
        enabled: new Map(current.enabled).set(name, true),
      }))
    }
  }

  const handleToggle = async (entry: CatalogEntry) => {
    const enabled = !isEntryEnabled(entry)
    setEnabledById((current) => new Map(current).set(entry.pluginId, enabled))
    try {
      await setAgentPluginEnabled(entry.pluginId, enabled)
      notifyRestart()
      setInstalled((current) => ({
        ...current,
        enabled: new Map(current.enabled).set(entry.name, enabled),
      }))
    } catch {
      setEnabledById((current) => {
        const next = new Map(current)
        next.delete(entry.pluginId)
        return next
      })
      toast.add({ id: 'agent-plugin-toggle', title: t('settings.agent.saveError'), type: 'error' })
    }
  }

  const handleUninstall = async (pluginId: string) => {
    try {
      await removeAgentPlugin(pluginId)
      notifyRestart()
      const name = installedName(pluginId)
      setInstalled((current) => {
        const names = new Set(current.names)
        names.delete(name)
        const ids = new Set(current.ids)
        ids.delete(pluginId)
        const enabled = new Map(current.enabled)
        enabled.delete(name)
        return { names, ids, enabled }
      })
    } catch {
      toast.add({
        id: 'agent-plugin-remove',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  const handleOpen = (entry: CatalogEntry) => {
    const homepage = homepagesById.get(entry.pluginId)
    if (homepage) {
      void requestFromDesktop('appOpenLink', { href: homepage, projectPath: '' })
    }
  }

  return (
    <section className="flex flex-col gap-4" data-install-page>
      <div className="flex items-center justify-between gap-4">
        <Select
          items={sourceItems}
          value={sourceFilter}
          onValueChange={(value) => {
            setSourceFilter(typeof value === 'string' ? value : '')
            setRenderLimit(INSTALL_PAGE_SIZE)
          }}
        >
          <SelectTrigger aria-label={t('settings.agent.plugins.source')} className="min-w-40">
            <SelectValue />
          </SelectTrigger>
          {/* Widen past the anchor width so long marketplace slugs don't clip. */}
          <SelectContent
            align="start"
            alignItemWithTrigger={false}
            className="w-fit min-w-(--anchor-width)"
          >
            <SelectGroup>
              {sourceItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          className="w-60"
          placeholder={t('settings.agent.plugins.searchPlaceholder')}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setRenderLimit(INSTALL_PAGE_SIZE)
          }}
        />
      </div>

      {isLoading ? (
        <Spinner className="self-center" />
      ) : shown.length === 0 ? (
        <AgentEmpty />
      ) : (
        <div className="flex flex-col" data-install-list>
          {shown.map((entry) => {
            const isInstalled = installed.names.has(entry.name)
            const isEnabled = isEntryEnabled(entry)
            return (
              <div
                className="flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
                data-install-tile
                key={entry.pluginId}
                onClick={() =>
                  openDetail('agent-marketplace', entry.pluginId, entry.name, 'install')
                }
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="truncate text-sm font-normal">{entry.name}</div>
                  {entry.description ? (
                    <div className="truncate text-xs text-foreground-subtlest">
                      {entry.description}
                    </div>
                  ) : null}
                  <div className="flex items-center gap-2 text-[11px] tabular-nums text-foreground-subtlest">
                    <span>{entry.marketplaceName}</span>
                    {typeof entry.installCount === 'number' ? (
                      <>
                        <span aria-hidden className="text-foreground-subtlest/50">
                          |
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="size-3" aria-hidden />
                          {entry.installCount.toLocaleString()}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                {isInstalled ? (
                  <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={t('settings.agent.plugins.more')}
                        render={<Button size="icon" variant="ghost" />}
                      >
                        <EllipsisVertical className="size-4 text-foreground-subtlest" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        aria-label={t('settings.agent.plugins.more')}
                      >
                        <DropdownMenuItem onClick={() => void handleToggle(entry)}>
                          {isEnabled
                            ? t('settings.agent.plugins.disable')
                            : t('settings.agent.plugins.enable')}
                        </DropdownMenuItem>
                        {homepagesById.get(entry.pluginId) ? (
                          <DropdownMenuItem onClick={() => handleOpen(entry)}>
                            {t('settings.agent.plugins.open')}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => void handleUninstall(entry.pluginId)}
                        >
                          {t('settings.agent.plugins.uninstall')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : (
                  <Button
                    aria-label={t('settings.agent.plugins.install')}
                    className="text-foreground-subtlest"
                    onClick={(event) => {
                      event.stopPropagation()
                      void handleInstall(entry.pluginId)
                    }}
                    size="icon"
                    variant="ghost"
                  >
                    <Plus />
                  </Button>
                )}
              </div>
            )
          })}
          {hasMore ? <div data-install-sentinel ref={sentinelRef} /> : null}
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
