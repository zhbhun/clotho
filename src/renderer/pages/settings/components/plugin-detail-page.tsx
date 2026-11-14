import { Blocks, type LucideIcon, Sparkles, SquareTerminal, Waypoints, Webhook } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import type { AgentPluginDetails } from '@/shared/rpc'

import {
  getAgentPluginDetails,
  removeAgentPlugin,
  setAgentPluginEnabled,
} from '../../../services/claude/agent-config'
import { requestFromDesktop } from '../../../services/desktop/client'
import { updateInstalled } from './catalog-cache'
import { PluginAvatar } from './plugin-avatar'
import { PluginOverflowMenu, useRestartHint } from './plugin-shared'
import { useSettingsDetailStore } from './settings-detail-store'

/**
 * Identity line of the store-style header: neutral avatar, large title, and
 * an "author • category" subtitle spanning exactly the avatar's height.
 * Page actions (install button, overflow menu) align against this row.
 */
export function PluginDetailIdentity({
  displayName,
  name,
  author,
  category,
}: Pick<AgentPluginDetails, 'displayName' | 'name'> & {
  author?: string
  category?: string
}) {
  const { t } = useTranslation()
  const subtitle = [author ? t('settings.agent.plugins.byAuthor', { author }) : undefined, category]
    .filter(Boolean)
    .join(' • ')
  return (
    <div className="flex items-center gap-5">
      <PluginAvatar className="size-14 rounded-2xl text-xl" name={name} variant="neutral" />
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName ?? name}</h1>
        {subtitle ? (
          <p className="mt-1 truncate text-base text-foreground-subtle">{subtitle}</p>
        ) : null}
      </div>
    </div>
  )
}

export function DetailSection({
  count,
  title,
  children,
}: {
  count?: number
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col">
      <h3 className="flex items-baseline gap-2 border-b pb-3 text-lg font-semibold">
        {title}
        {typeof count === 'number' ? (
          <span className="text-sm font-normal text-foreground-subtlest">{count}</span>
        ) : null}
      </h3>
      <div className="pt-2">{children}</div>
    </div>
  )
}

/** Icon chip shown at the start of each component row (prototype `.comp-icon`). */
const SECTION_ICONS: Record<string, LucideIcon> = {
  skills: Sparkles,
  commands: SquareTerminal,
  mcpServers: Blocks,
  subagents: Waypoints,
  hooks: Webhook,
}

/** `subagent-driven-development` → `Subagent-driven Development` for display. */
function componentDisplayName(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}

function DetailRows({
  kind,
  rows,
}: {
  kind: keyof typeof SECTION_ICONS
  rows: { name: string; description?: string }[]
}) {
  if (rows.length === 0) return null
  const Icon = SECTION_ICONS[kind]
  return (
    <div className="flex flex-col pt-1">
      {rows.map((row) => (
        <div className="flex items-center gap-4 py-3" key={row.name}>
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted opacity-80">
            <Icon className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate">
              {/* Event names (SessionStart) are proper nouns — no title-casing. */}
              {kind === 'hooks' ? row.name : componentDisplayName(row.name)}
            </div>
            {row.description ? (
              <div className="truncate text-foreground-subtlest">{row.description}</div>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Shared component sections + info grid for the plugin/install detail pages. */
export function PluginDetailSections({
  details,
}: {
  details: Pick<AgentPluginDetails, 'skills' | 'commands' | 'mcpServers' | 'subagents' | 'hooks'>
}) {
  const { t } = useTranslation()
  const sections = [
    { key: 'skills', title: t('settings.agent.plugins.skills'), rows: details.skills },
    { key: 'commands', title: t('settings.agent.plugins.commands'), rows: details.commands },
    {
      key: 'mcpServers',
      title: t('settings.agent.plugins.mcpServers'),
      rows: details.mcpServers,
    },
    { key: 'subagents', title: t('settings.agent.plugins.subagents'), rows: details.subagents },
    { key: 'hooks', title: t('settings.agent.plugins.hooks'), rows: details.hooks },
  ] as const
  return (
    <>
      {sections
        .filter((section) => section.rows.length > 0)
        .map((section) => (
          <DetailSection key={section.key} count={section.rows.length} title={section.title}>
            <DetailRows kind={section.key} rows={[...section.rows]} />
          </DetailSection>
        ))}
    </>
  )
}

/** Key/value rows of the detail Info block; unknown values are omitted per row. */
export function PluginInfoRows({
  rows,
  onOpenLink,
}: {
  rows: { key: string; value?: string | number; link?: string }[]
  /** Opens `link` values via the app link opener; omitted rows render as text. */
  onOpenLink?: (href: string) => void
}) {
  // Unknown is `undefined`; `0` (e.g. install count) is a known value and stays.
  const visible = rows.filter((row) => row.value !== undefined)
  if (visible.length === 0) return null
  return (
    <div className="flex flex-col gap-4 pt-1">
      {visible.map((row) => (
        <div className="grid grid-cols-[110px_1fr] gap-4" key={row.key}>
          <span className="text-foreground-subtlest">{row.key}</span>
          {row.link && onOpenLink ? (
            <button
              type="button"
              title={row.link}
              className="min-w-0 cursor-pointer truncate text-start text-foreground transition-colors hover:text-brand"
              onClick={() => onOpenLink(row.link as string)}
            >
              {row.value}
            </button>
          ) : (
            <span className="min-w-0 truncate">{row.value}</span>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Second-level plugin detail page: components, info block, and the `⋯` menu
 * with enable/disable and uninstall. Data comes from getAgentPluginDetails.
 */
export function PluginDetailPage({ pluginId }: { pluginId: string }) {
  const { t } = useTranslation()
  const [details, setDetails] = useState<AgentPluginDetails | null>(null)
  const openLink = (href: string) =>
    void requestFromDesktop('appOpenLink', { href, projectPath: '' })
  const [isLoading, setIsLoading] = useState(true)
  const backToList = useSettingsDetailStore((state) => state.backToList)
  const notifyRestart = useRestartHint()

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    getAgentPluginDetails(pluginId)
      .then((result) => {
        if (!cancelled) setDetails(result)
      })
      .catch(() => {
        if (!cancelled) {
          toast.add({
            id: 'agent-plugin-details',
            title: t('settings.agent.plugins.notFound'),
            type: 'error',
          })
          backToList()
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pluginId])

  const handleToggle = async (enabled: boolean) => {
    if (!details) return
    setDetails((current) => (current ? { ...current, enabled } : current))
    try {
      await setAgentPluginEnabled(details.pluginId, enabled)
      updateInstalled(details.pluginId, enabled)
      notifyRestart()
    } catch {
      setDetails((current) => (current ? { ...current, enabled: !enabled } : current))
      toast.add({ id: 'agent-plugin-toggle', title: t('settings.agent.saveError'), type: 'error' })
    }
  }

  const handleUninstall = async () => {
    if (!details) return
    try {
      await removeAgentPlugin(details.pluginId)
      updateInstalled(details.pluginId, 'remove')
      notifyRestart()
      backToList()
    } catch {
      toast.add({
        id: 'agent-plugin-remove',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  if (isLoading || !details) {
    return (
      <section className="flex flex-col gap-4" data-plugin-detail-page>
        <Spinner className="self-center" />
      </section>
    )
  }

  const info: { key: string; value?: string; link?: string }[] = [
    { key: t('settings.agent.plugins.author'), value: details.author },
    { key: t('settings.agent.plugins.category'), value: details.category },
    { key: t('settings.agent.plugins.version'), value: details.version },
    {
      key: t('settings.agent.plugins.homepage'),
      value: details.homepage,
      link: details.homepage,
    },
    { key: t('settings.agent.plugins.marketplace'), value: details.marketplace },
    { key: t('settings.agent.plugins.rootPath'), value: details.installPath },
    {
      key: t('settings.agent.plugins.installedAt'),
      value: details.installedAt
        ? new Date(details.installedAt).toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : undefined,
    },
  ]

  return (
    <section className="flex flex-col gap-5" data-plugin-detail-page>
      <div className="flex items-center justify-between gap-4">
        <PluginDetailIdentity
          author={details.author}
          category={details.category}
          displayName={details.displayName}
          name={details.name}
        />
        <div className="flex shrink-0 items-center gap-2">
          {details.installed ? (
            <PluginOverflowMenu
              items={[
                {
                  label: details.enabled
                    ? t('settings.agent.plugins.disable')
                    : t('settings.agent.plugins.enable'),
                  onSelect: () => void handleToggle(!details.enabled),
                },
                {
                  label: t('settings.agent.plugins.uninstall'),
                  onSelect: () => void handleUninstall(),
                  destructive: true,
                },
              ]}
              label={t('settings.agent.plugins.more')}
            />
          ) : null}
        </div>
      </div>
      {details.description ? (
        <p className="text-sm text-foreground-subtlest">{details.description}</p>
      ) : null}

      <PluginDetailSections details={details} />

      <DetailSection title={t('settings.agent.plugins.info')}>
        <PluginInfoRows rows={info} onOpenLink={openLink} />
        <div className="grid grid-cols-[110px_1fr] gap-4 pt-4">
          <span className="text-foreground-subtlest">{t('settings.agent.enabled')}</span>
          <span>
            {details.installed ? (
              <Badge variant="secondary">
                {details.enabled
                  ? t('settings.agent.plugins.enable')
                  : t('settings.agent.plugins.disable')}
              </Badge>
            ) : (
              <Badge variant="secondary">{t('settings.agent.plugins.installed')}</Badge>
            )}
          </span>
        </div>
      </DetailSection>
    </section>
  )
}
