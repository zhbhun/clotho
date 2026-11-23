import { EllipsisVertical } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shadcn/dropdown-menu'
import { toast } from '@/shadcn/toast'

import { deleteAgentSkill } from '../../services/claude/agent-config'
import { DeleteConfirmDialog } from './agent-shared'

export function SkillActions({
  name,
  className,
  onOpen,
  onUninstall,
}: {
  name: string
  className?: string
  onOpen: () => void
  onUninstall: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)
  async function uninstall() {
    try {
      await deleteAgentSkill(name)
      await onUninstall()
    } catch {
      toast.add({ id: 'agent-skill-delete', title: t('settings.agent.deleteError'), type: 'error' })
    }
  }
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('settings.agent.plugins.more') + ' · ' + name}
          render={<Button className={className} size="icon" variant="ghost" />}
        >
          <EllipsisVertical className="size-4 text-foreground-subtlest" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onOpen}>{t('settings.agent.plugins.open')}</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => setConfirmOpen(true)}>
            {t('settings.agent.plugins.uninstall')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {confirmOpen && (
        <DeleteConfirmDialog
          open
          title={t('settings.agent.plugins.uninstall')}
          actionLabel={t('settings.agent.plugins.uninstall')}
          description={t('settings.agent.skills.confirmDelete', { name })}
          onOpenChange={setConfirmOpen}
          onDelete={uninstall}
        />
      )}
    </>
  )
}
