import { Ellipsis } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/dropdown-menu'
import { Switch } from '@/shadcn/switch'

import { DeleteConfirmDialog } from '../../../components/marketplace/agent-shared'
import { PluginAvatar } from '../../../components/marketplace/plugin-avatar'
import type { AgentMcpServerConfig } from '../../../services/claude/agent-config'

export function McpRow({
  server,
  onEdit,
  onDelete,
  onToggle,
}: {
  server: AgentMcpServerConfig
  onEdit: () => void
  onDelete: () => Promise<void> | void
  onToggle: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const summary =
    server.type === 'stdio' ? [server.command, ...(server.args ?? [])].join(' ') : server.url

  return (
    <>
      <div
        className="group/mcp flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50"
        onClick={onEdit}
      >
        <PluginAvatar name={server.name} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{server.name}</div>
          <div className="truncate text-sm text-foreground-subtle">
            {[server.type, summary].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="-mr-1" onClick={(event) => event.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t('settings.agent.plugins.more') + ' · ' + server.name}
              render={
                <Button
                  className="pointer-events-none opacity-0 group-hover/mcp:pointer-events-auto group-hover/mcp:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <Ellipsis />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={onEdit}>{t('settings.common.edit')}</DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setIsDeleteOpen(true)}>
                  {t('settings.common.delete')}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Switch
          aria-label={t('settings.agent.enabled')}
          checked={!server.disabled}
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={onToggle}
        />
      </div>
      <DeleteConfirmDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen} onDelete={onDelete} />
    </>
  )
}
