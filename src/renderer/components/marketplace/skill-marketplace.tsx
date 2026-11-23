import { Download, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
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
  type MarketSkill,
  PUBLISHED_SKILL_CHARTS,
  type PublishedSkillChart,
  type PublishedSkillRow,
} from '@/shared/rpc'

import {
  findMarketSkills,
  installMarketSkill,
  listAgentSkills,
} from '../../services/claude/agent-config'
import { requestFromDesktop } from '../../services/desktop/client'
import { PluginAvatar } from './plugin-avatar'
import { InstallPageSkeleton } from './plugin-skeletons'
import { useSettingsDetailStore } from './settings-detail-store'
import { SkillActions } from './skill-actions'
import { useSkillRankings } from './use-skill-rankings'

// skills CLI 1.8.1 uses this directory name when installing a selector.
function directoryName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 255) || 'unnamed-skill'
  )
}

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

function ExternalLink({
  href,
  children,
  label,
}: {
  href: string
  children: string
  label?: string
}) {
  return (
    <a
      className="cursor-pointer hover:underline"
      href={href}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault()
        void requestFromDesktop('appOpenLink', { href, projectPath: '' })
      }}
    >
      {children}
    </a>
  )
}

export function SkillMarketplace() {
  const { t, i18n } = useTranslation()
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const [view, setView] = useState<PublishedSkillChart>('best-100')
  const [input, setInput] = useState('')
  const query = input.trim()
  const ranks = useSkillRankings(view)
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

  const options = PUBLISHED_SKILL_CHARTS.map((value) => ({
    value,
    label: t(`settings.agent.skillMarket.chart.${value}`),
  }))
  const rows: (MarketSkill | PublishedSkillRow)[] | null | undefined = query
    ? search.rows
    : ranks.snapshot?.rows
  const failed = query ? search.rows === null : ranks.failed
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Select items={options} value={view} onValueChange={(value) => value && setView(value)}>
          <SelectTrigger className="min-w-40" aria-label={t('settings.agent.skillMarket.ranking')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Input
          className="w-60"
          type="search"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t('settings.agent.skillMarket.search')}
        />
      </div>
      {failed && (
        <div className="flex items-center justify-center gap-2 text-sm text-foreground-subtle">
          {t(
            query
              ? 'settings.agent.skillMarket.searchFailed'
              : 'settings.agent.skillMarket.unavailable',
          )}
          <Button variant="outline" size="sm" onClick={query ? search.retry : ranks.retry}>
            {t('settings.agent.skillMarket.retry')}
          </Button>
        </div>
      )}
      {!rows ? (
        !failed && <InstallPageSkeleton />
      ) : rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-foreground-subtle">
          {t('settings.agent.skillMarket.noResults')}
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-6 max-lg:grid-cols-1">
          {rows.map((skill) => {
            const { source, name, installs } = skill
            const entry = 'metric' in skill ? skill : undefined
            const directory = directoryName(name)
            const installed =
              installedSources.get(directory)?.toLowerCase() === source.toLowerCase()
            const nameInUse = installedSources.has(directory)
            return (
              <div
                className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
                key={entry ? view + ':' + entry.rank : source + '@' + name}
              >
                <PluginAvatar name={name} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="truncate text-sm font-medium">
                    {entry && (
                      <span className="mr-2 font-normal text-foreground-subtlest">
                        #{entry.rank}
                      </span>
                    )}
                    {skill.url ? <ExternalLink href={skill.url}>{name}</ExternalLink> : name}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] tabular-nums text-foreground-subtlest">
                    <span className="truncate">{source}</span>
                    {entry?.value && (
                      <span className="shrink-0">
                        {t(`settings.agent.skillMarket.metric.${entry.metric}`, {
                          value: /^-?\d+(?:\.\d+)?$/.test(entry.value)
                            ? Number(entry.value).toLocaleString(i18n.language)
                            : entry.value,
                        })}
                      </span>
                    )}
                    {installs && (
                      <>
                        <span aria-hidden className="text-foreground-subtlest/50">
                          |
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <Download className="size-3" />
                          {/^\d+$/.test(installs)
                            ? Number(installs).toLocaleString(i18n.language)
                            : installs}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                {entry && !entry.installable ? null : installed ? (
                  <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
                ) : nameInUse ? (
                  <SkillActions
                    name={directory}
                    onOpen={() => openDetail('agent-marketplace', directory, directory, 'skills')}
                    onUninstall={() =>
                      setInstalledSources((current) => {
                        const next = new Map(current)
                        next.delete(directory)
                        return next
                      })
                    }
                  />
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-foreground-subtlest"
                    aria-label={t('settings.agent.skillMarket.install', { name })}
                    disabled={pending.has(directory)}
                    onClick={() => void handleInstall(skill)}
                  >
                    {pending.has(directory) ? <Spinner /> : <Plus />}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {!query && ranks.snapshot && (
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
            time: new Date(ranks.snapshot.syncedAt).toLocaleString(i18n.language),
          })}
        </footer>
      )}
    </section>
  )
}
