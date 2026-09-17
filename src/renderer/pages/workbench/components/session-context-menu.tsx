import { CopyX, ListX, PanelRightClose, Pencil, Pin, PinOff, Trash2, X } from 'lucide-react'
import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/shadcn/context-menu'

import type { WorkbenchSession } from '../stores/workbench-store'

export function SessionContextMenu({
  children,
  close,
  isPinned,
  session,
  onDeleteSession,
  onRenameSession,
  onTogglePinSession,
}: {
  children: ReactElement
  close?: {
    sessions: WorkbenchSession[]
    onCloseSession: (session: WorkbenchSession) => void
  }
  isPinned: boolean
  session: WorkbenchSession
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent glass>
        {close ? (
          <>
            <ContextMenuGroup>
              <ContextMenuItem onClick={() => close.onCloseSession(session)}>
                <X />
                {t('workbench.session.closeTab')}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={close.sessions.length <= 1}
                onClick={() => {
                  for (const candidate of close.sessions) {
                    if (candidate.id !== session.id) close.onCloseSession(candidate)
                  }
                }}
              >
                <CopyX />
                {t('workbench.session.closeOtherTabs')}
              </ContextMenuItem>
              <ContextMenuItem
                disabled={close.sessions[close.sessions.length - 1]?.id === session.id}
                onClick={() => {
                  const sessionIndex = close.sessions.findIndex(
                    (candidate) => candidate.id === session.id,
                  )
                  if (sessionIndex < 0) return
                  for (const candidate of close.sessions.slice(sessionIndex + 1)) {
                    close.onCloseSession(candidate)
                  }
                }}
              >
                <PanelRightClose />
                {t('workbench.session.closeTabsToRight')}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  for (const candidate of close.sessions) close.onCloseSession(candidate)
                }}
              >
                <ListX />
                {t('workbench.session.closeAllTabs')}
              </ContextMenuItem>
            </ContextMenuGroup>
            <ContextMenuSeparator />
          </>
        ) : null}
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => onTogglePinSession(session)}>
            {isPinned ? <PinOff /> : <Pin />}
            {isPinned ? t('workbench.action.unpin') : t('workbench.action.pin')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onRenameSession(session)}>
            <Pencil />
            {t('workbench.action.rename')}
          </ContextMenuItem>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive" onClick={() => onDeleteSession(session)}>
            <Trash2 />
            {t('workbench.action.delete')}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
