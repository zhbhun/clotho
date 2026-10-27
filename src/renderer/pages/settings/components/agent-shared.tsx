import { Trash2 } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shadcn/alert-dialog'
import { Button } from '@/shadcn/button'
import { toast } from '@/shadcn/toast'

import { AppAlertDialog, AppAlertDialogContent } from '../../../components/app-dialog'
import { SettingsSection } from '../../../components/settings-section'
import { requestFromDesktop } from '../../../services/desktop/client'

/**
 * Shared list-section shell for the six agent capability domains: heading,
 * optional add action, and an empty hint.
 */
export function AgentSection({
  titleKey,
  addLabel,
  onAdd,
  children,
}: {
  titleKey: 'subagents' | 'plugins' | 'mcp' | 'skills' | 'hooks' | 'workflows'
  addLabel?: string
  onAdd?: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <SettingsSection
      title={t(`settings.agent.title.${titleKey}`)}
      action={
        onAdd && addLabel ? (
          <Button size="sm" variant="outline" onClick={onAdd}>
            {addLabel}
          </Button>
        ) : undefined
      }
    >
      {children}
    </SettingsSection>
  )
}

/** Shared "nothing here yet" row for empty lists. */
export function AgentEmpty() {
  const { t } = useTranslation()
  return <p className="text-sm text-foreground-subtlest">{t('settings.agent.empty')}</p>
}

/**
 * Clotho-scoped enable toggle (design D1): flips the shared disabled list in
 * Clotho settings; CLI files are never touched. Failures roll the switch back.
 */
export function useCapabilityToggle(kind: 'plugin' | 'skill') {
  const { t } = useTranslation()
  return async (name: string, enabled: boolean) => {
    try {
      return await requestToggle(kind, name, enabled)
    } catch {
      toast.add({
        id: `agent-toggle-${kind}-${name}`,
        title: t('settings.agent.saveError'),
        type: 'error',
      })
      return !enabled
    }
  }
}

async function requestToggle(kind: 'plugin' | 'skill', name: string, enabled: boolean) {
  return requestFromDesktop('agentSetCapabilityToggle', { kind, name, enabled })
}

/** Delete button with a confirm dialog; runs `onDelete` only on confirm. */
export function DeleteButton({
  label,
  onDelete,
}: {
  label: string
  onDelete: () => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <Button
        aria-label={label}
        className="text-foreground-subtlest"
        size="icon-sm"
        variant="ghost"
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 />
      </Button>
      <AppAlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AppAlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.agent.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.agent.confirmDelete')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('settings.common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false)
                void onDelete()
              }}
            >
              {t('settings.common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AppAlertDialogContent>
      </AppAlertDialog>
    </>
  )
}
