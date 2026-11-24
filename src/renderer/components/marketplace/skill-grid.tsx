import { Download, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Spinner } from '@/shadcn/spinner'
import type { MarketSkill, PublishedSkillRow } from '@/shared/rpc'

import { requestFromDesktop } from '../../services/desktop/client'
import { PluginAvatar } from './plugin-avatar'
import { SkillActions } from './skill-actions'

// skills CLI 1.8.1 uses this directory name when installing a selector.
export function directoryName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._]+/g, '-')
      .replace(/^[.-]+|[.-]+$/g, '')
      .slice(0, 255) || 'unnamed-skill'
  )
}

export function ExternalLink({
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

export interface SkillGridProps {
  rows: (MarketSkill | PublishedSkillRow)[]
  installedSources: Map<string, string | undefined>
  pending: Set<string>
  onInstall: (skill: MarketSkill) => Promise<void>
  onOpen: (directory: string) => void
  onUninstall: (directory: string) => void
}

export function SkillGrid({
  rows,
  installedSources,
  pending,
  onInstall,
  onOpen,
  onUninstall,
}: SkillGridProps) {
  const { t, i18n } = useTranslation()
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-6 gap-y-1 max-lg:grid-cols-1">
      {rows.map((skill) => {
        const { source, name, installs } = skill
        const entry = 'metric' in skill ? skill : undefined
        const directory = directoryName(name)
        const installed = installedSources.get(directory)?.toLowerCase() === source.toLowerCase()
        const nameInUse = installedSources.has(directory)
        return (
          <div
            className="flex min-w-0 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
            data-skill-tile
            key={source + '@' + name}
          >
            <PluginAvatar name={name} rank={entry?.rank} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="truncate text-sm font-medium">
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
                onOpen={() => onOpen(directory)}
                onUninstall={() => onUninstall(directory)}
              />
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="text-foreground-subtlest"
                aria-label={t('settings.agent.skillMarket.install', { name })}
                disabled={pending.has(directory)}
                onClick={() => void onInstall(skill)}
              >
                {pending.has(directory) ? <Spinner /> : <Plus />}
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
