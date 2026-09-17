import { ArrowLeft, ArrowRight } from 'lucide-react'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { SidebarTrigger } from '@/shadcn/sidebar'
import type { CommandId } from '@/shared/shortcuts'

import { SidebarToggleIcon } from '../../../components/sidebar-toggle-icon'
import { useCommandEnabled } from '../../../hooks/use-command-enabled'
import { dispatchCommand } from '../../../services/shortcuts/dispatcher'
import { useShortcutRuntime } from '../../../services/shortcuts/runtime'
import { ShortcutTooltip } from '../components/shortcut-tooltip'

export function MacWindowChrome() {
  const { t } = useTranslation()

  return (
    <div className="app-region-drag flex h-11 items-center gap-1 px-3 pl-[84px] text-foreground-subtlest">
      <ShortcutTooltip
        commandId="workbench.sidebar.toggle"
        label={t('workbench.nav.toggleSidebar')}
        side="bottom"
      >
        <SidebarTrigger
          className="app-region-no-drag shrink-0"
          icon={SidebarToggleIcon}
          size="icon"
        />
      </ShortcutTooltip>
      <HistoryNavButton
        commandId="workbench.navigation.back"
        dataSidebar="history-back"
        label={t('shortcut.command.navigationBack.title')}
      >
        <ArrowLeft className="size-4" strokeWidth={1.5} />
      </HistoryNavButton>
      <HistoryNavButton
        commandId="workbench.navigation.forward"
        dataSidebar="history-forward"
        label={t('shortcut.command.navigationForward.title')}
      >
        <ArrowRight className="size-4" strokeWidth={1.5} />
      </HistoryNavButton>
    </div>
  )
}

function HistoryNavButton({
  commandId,
  dataSidebar,
  label,
  children,
}: {
  commandId: CommandId
  dataSidebar: string
  label: string
  children: ReactNode
}) {
  const { registry } = useShortcutRuntime()
  const isEnabled = useCommandEnabled(commandId)

  return (
    <ShortcutTooltip commandId={commandId} label={label} side="bottom">
      <Button
        className="app-region-no-drag shrink-0"
        data-sidebar={dataSidebar}
        disabled={!isEnabled}
        onClick={() => void dispatchCommand(registry, commandId)}
        size="icon"
        type="button"
        variant="ghost"
      >
        {children}
      </Button>
    </ShortcutTooltip>
  )
}
