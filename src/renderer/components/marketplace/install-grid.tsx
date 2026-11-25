import { Download, EllipsisVertical, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../dropdown-menu'
import type { CatalogEntry } from './install-catalog'
import { PluginAvatar } from './plugin-avatar'
import type { useInstallActions } from './use-install-actions'

export function InstallGrid({
  entries,
  actions,
  isRanked = false,
  onDetails,
}: {
  entries: CatalogEntry[]
  actions: ReturnType<typeof useInstallActions>
  isRanked?: boolean
  onDetails: (entry: CatalogEntry) => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] max-lg:grid-cols-1 gap-x-6 gap-y-1"
      data-install-grid
    >
      {entries.map((entry, index) => {
        const isInstalled = actions.installedIds.has(entry.pluginId)
        const isEnabled = actions.isEnabled(entry)
        return (
          <div
            className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
            data-install-tile
            data-plugin-id={entry.pluginId}
            key={entry.pluginId}
            onClick={() => onDetails(entry)}
          >
            <PluginAvatar name={entry.name} rank={isRanked ? index + 1 : undefined} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-medium">{entry.name}</div>
                {typeof entry.installCount === 'number' ? (
                  <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-foreground-subtlest">
                    <Download className="size-3" aria-hidden />
                    {entry.installCount.toLocaleString()}
                  </span>
                ) : null}
              </div>
              {entry.description ? (
                <div className="truncate text-xs text-foreground-subtlest">{entry.description}</div>
              ) : null}
            </div>
            {isInstalled ? (
              <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={t('settings.agent.plugins.more')}
                    render={<Button size="icon" variant="ghost" />}
                  >
                    <EllipsisVertical />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" aria-label={t('settings.agent.plugins.more')}>
                    <DropdownMenuItem onClick={() => void actions.toggle(entry)}>
                      {isEnabled
                        ? t('settings.agent.plugins.disable')
                        : t('settings.agent.plugins.enable')}
                    </DropdownMenuItem>
                    {actions.homepagesById.get(entry.pluginId) ? (
                      <DropdownMenuItem onClick={() => actions.open(entry)}>
                        {t('settings.agent.plugins.open')}
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => void actions.uninstall(entry.pluginId)}
                    >
                      {t('settings.agent.plugins.uninstall')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <Button
                aria-label={t('settings.agent.plugins.install')}
                size="icon"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation()
                  void actions.install(entry.pluginId)
                }}
              >
                <Plus />
              </Button>
            )}
          </div>
        )
      })}
    </div>
  )
}
