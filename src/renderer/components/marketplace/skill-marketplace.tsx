import { ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Separator } from '@/shadcn/separator'
import { toast } from '@/shadcn/toast'
import { type MarketSkill, PUBLISHED_SKILL_CHARTS } from '@/shared/rpc'

import {
  findMarketSkills,
  installMarketSkill,
  listAgentSkills,
} from '../../services/claude/agent-config'
import { MarketplaceToolbar } from './marketplace-toolbar'
import { InstallPageSkeleton } from './plugin-skeletons'
import { useSettingsDetailStore } from './settings-detail-store'
import { ExternalLink, SkillGrid, directoryName } from './skill-grid'
import { useSkillRankings } from './use-skill-rankings'

function useSkillSearch(query: string) {
  const [response, setResponse] = useState<{ query: string; rows: MarketSkill[] | null }>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!query) return
    let active = true
    const timeout = window.setTimeout(async () => {
      try {
        const rows = await findMarketSkills(query)
        if (active) setResponse({ query, rows })
      } catch {
        if (active) setResponse({ query, rows: null })
      }
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [query, attempt])

  return {
    rows: response?.query === query ? response.rows : undefined,
    retry() {
      setResponse(undefined)
      setAttempt((n) => n + 1)
    },
  }
}

export function SkillMarketplace({ toolbar }: { toolbar?: HTMLElement | null } = {}) {
  const { t, i18n } = useTranslation()
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const view = useSettingsDetailStore((state) => state.view)
  const openSub = useSettingsDetailStore((state) => state.openSub)
  const chart =
    view.kind === 'detail' &&
    view.categoryId === 'agent-marketplace' &&
    view.page === 'skill-section'
      ? PUBLISHED_SKILL_CHARTS.find((chart) => chart === view.file)
      : undefined
  const [input, setInput] = useState('')
  const query = input.trim()
  const ranks = useSkillRankings()
  const search = useSkillSearch(query)
  const [installedSources, setInstalledSources] = useState<Map<string, string | undefined>>(
    new Map(),
  )
  const [pending, setPending] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    listAgentSkills()
      .then((skills) => {
        if (active)
          setInstalledSources(
            (current) =>
              new Map([
                ...skills.map(({ name, marketSource }) => [name, marketSource] as const),
                ...current,
              ]),
          )
      })
      .catch(() => {
        if (active) toast.add({ title: t('settings.agent.loadError'), type: 'error' })
      })
    return () => {
      active = false
    }
  }, [t])

  async function handleInstall({ source, name }: MarketSkill) {
    const directory = directoryName(name)
    setPending((current) => new Set(current).add(directory))
    try {
      await installMarketSkill(source, name)
      setInstalledSources((current) => new Map(current).set(directory, source))
    } catch (error) {
      toast.add({
        title: t('settings.agent.skillMarket.installFailed', { name }),
        description: error instanceof Error ? error.message : undefined,
        type: 'error',
      })
    } finally {
      setPending((current) => {
        const next = new Set(current)
        next.delete(directory)
        return next
      })
    }
  }

  const gridActions = {
    installedSources,
    pending,
    onInstall: handleInstall,
    onOpen(directory: string) {
      if (chart) openSub('agent-marketplace', 'skill-detail', directory, directory)
      else openDetail('agent-marketplace', directory, directory, 'skills')
    },
    onUninstall(directory: string) {
      setInstalledSources((current) => {
        const next = new Map(current)
        next.delete(directory)
        return next
      })
    },
  }
  const charts = chart ? [chart] : PUBLISHED_SKILL_CHARTS
  const syncedAt = Math.min(...Object.values(ranks.snapshots).map((board) => board.syncedAt))

  return (
    <section className="flex flex-col gap-4" data-skill-marketplace>
      {!chart ? (
        <MarketplaceToolbar target={toolbar}>
          <Input
            className="w-60 max-w-full"
            type="search"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t('settings.agent.skillMarket.search')}
          />
        </MarketplaceToolbar>
      ) : null}
      {query ? (
        search.rows === undefined ? (
          <InstallPageSkeleton />
        ) : search.rows === null ? (
          <div className="flex items-center justify-center gap-2 text-sm text-foreground-subtle">
            {t('settings.agent.skillMarket.searchFailed')}
            <Button variant="outline" size="sm" onClick={search.retry}>
              {t('settings.agent.skillMarket.retry')}
            </Button>
          </div>
        ) : search.rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-foreground-subtle">
            {t('settings.agent.skillMarket.noResults')}
          </div>
        ) : (
          <SkillGrid rows={search.rows} {...gridActions} />
        )
      ) : (
        <div className="flex flex-col gap-8">
          {charts.map((id) => {
            const board = ranks.snapshots[id]
            return (
              <section className="flex flex-col gap-2" data-skill-chart={id} key={id}>
                <div className="flex flex-col gap-2">
                  <div
                    className={
                      !chart && board && board.rows.length > 10
                        ? 'flex w-fit cursor-pointer items-center gap-1 px-2'
                        : 'flex w-fit items-center gap-1 px-2'
                    }
                    onClick={() => {
                      if (chart || !board || board.rows.length <= 10) return
                      openDetail(
                        'agent-marketplace',
                        id,
                        t(`settings.agent.skillMarket.chart.${id}`),
                        'skill-section',
                      )
                    }}
                  >
                    <h2 className="text-lg font-semibold tracking-tight">
                      {t(`settings.agent.skillMarket.chart.${id}`)}
                    </h2>
                    {!chart && board && board.rows.length > 10 && (
                      <ChevronRight aria-hidden className="size-4 text-foreground-subtlest/60" />
                    )}
                  </div>
                  <Separator />
                </div>
                {ranks.failed.has(id) && (
                  <div className="flex items-center justify-center gap-2 text-sm text-foreground-subtle">
                    {t('settings.agent.skillMarket.unavailable')}
                    <Button variant="outline" size="sm" onClick={ranks.retry}>
                      {t('settings.agent.skillMarket.retry')}
                    </Button>
                  </div>
                )}
                {board ? (
                  board.rows.length ? (
                    <SkillGrid
                      rows={chart ? board.rows : board.rows.slice(0, 10)}
                      {...gridActions}
                      onOpen={(directory) => {
                        if (!chart) {
                          openDetail(
                            'agent-marketplace',
                            id,
                            t(`settings.agent.skillMarket.chart.${id}`),
                            'skill-section',
                          )
                        }
                        openSub('agent-marketplace', 'skill-detail', directory, directory)
                      }}
                    />
                  ) : (
                    <div className="py-8 text-center text-sm text-foreground-subtle">
                      {t('settings.agent.skillMarket.noResults')}
                    </div>
                  )
                ) : (
                  !ranks.failed.has(id) && <InstallPageSkeleton />
                )}
              </section>
            )
          })}
        </div>
      )}
      {!query && Number.isFinite(syncedAt) && (
        <footer className="px-2 text-[11px] text-foreground-subtlest">
          <ExternalLink
            href="https://github.com/LinklyAI/best-skills"
            label="Best Skills (LinklyAI/best-skills)"
          >
            Best Skills
          </ExternalLink>
          {' by '}
          <ExternalLink href="https://x.com/BlueeonY">@BlueeonY</ExternalLink>
          {' · '}
          <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>
          {' · '}
          {t('settings.agent.skillMarket.lastSync', {
            time: new Date(syncedAt).toLocaleString(i18n.language),
          })}
        </footer>
      )}
    </section>
  )
}
