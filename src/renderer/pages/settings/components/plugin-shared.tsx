import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { toast } from '@/shadcn/toast'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/dropdown-menu'
import { installAgentPlugin, refreshAgentMarketplace } from '../../../services/claude/agent-config'

/** Shared "changes apply to new sessions" hint after a plugin/marketplace change. */
export function useRestartHint() {
  const { t } = useTranslation()
  return () =>
    toast.add({
      id: 'agent-plugin-restart',
      title: t('settings.agent.plugins.restartHint'),
      type: 'info',
    })
}

/** Install via the CLI, surfacing the restart hint on success and an error toast otherwise. */
export async function installPluginWithToast(
  pluginId: string,
  notifyRestart: () => void,
  installError: string,
): Promise<boolean> {
  try {
    await installAgentPlugin(pluginId)
    notifyRestart()
    return true
  } catch {
    toast.add({ id: 'agent-plugin-install', title: installError, type: 'error' })
    return false
  }
}

/** Refresh every registered marketplace, reloading afterwards; error toast on failure. */
export async function refreshAllMarketplaces(
  reload: () => Promise<void>,
  refreshError: string,
): Promise<void> {
  try {
    await refreshAgentMarketplace()
    await reload()
  } catch {
    toast.add({ id: 'agent-marketplace-refresh', title: refreshError, type: 'error' })
  }
}

/** Shared list-header actions for the plugin pages: `⋯` overflow menu shell. */
export function PluginOverflowMenu({
  label,
  items,
}: {
  label: string
  items: { label: string; onSelect: () => void; destructive?: boolean }[]
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button aria-label={label} size="icon-sm" variant="outline" />}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={label}>
        {items.map((item) => (
          <DropdownMenuItem
            className={item.destructive ? 'text-destructive' : undefined}
            key={item.label}
            onClick={item.onSelect}
          >
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Row-end chevron opening a detail page; stops bubbling so the row click fires once. */
export function RowChevron({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <Button
      aria-label={label}
      className="text-foreground-subtlest"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      size="icon-sm"
      variant="ghost"
    >
      <ChevronRight className="size-4" />
    </Button>
  )
}
