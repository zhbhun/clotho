import {
  CopyX,
  ListX,
  PanelBottomClose,
  PanelRightClose,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  X,
} from 'lucide-react'
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

export type SessionMenuClose = {
  sessions: WorkbenchSession[]
  onCloseSession: (session: WorkbenchSession) => void
}

export function SessionContextMenu({
  children,
  close,
  isPinned,
  session,
  variant = 'tab',
  onDeleteSession,
  onRenameSession,
  onTogglePinSession,
}: {
  children: ReactElement
  close?: SessionMenuClose
  isPinned: boolean
  session: WorkbenchSession
  /** 'tab' phrases the direction item for a horizontal tab strip, 'list' for a vertical list. */
  variant?: 'tab' | 'list'
  onDeleteSession: (session: WorkbenchSession) => void
  onRenameSession: (session: WorkbenchSession) => void
  onTogglePinSession: (session: WorkbenchSession) => void
}) {
  const { t } = useTranslation()
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent glass>
        <ContextMenuGroup>
          <ContextMenuItem onClick={() => onTogglePinSession(session)}>
            {isPinned ? <PinOff strokeWidth={1.5} /> : <Pin strokeWidth={1.5} />}
            {isPinned ? t('workbench.action.unpin') : t('workbench.action.pin')}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => onRenameSession(session)}>
            <Pencil strokeWidth={1.5} />
            {t('workbench.action.rename')}
          </ContextMenuItem>
        </ContextMenuGroup>
        {close ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuGroup>
              <ContextMenuItem onClick={() => close.onCloseSession(session)}>
                <X strokeWidth={1.5} />
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
                <CopyX strokeWidth={1.5} />
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
                {variant === 'list' ? (
                  <PanelBottomClose strokeWidth={1.5} />
                ) : (
                  <PanelRightClose strokeWidth={1.5} />
                )}
                {t(
                  variant === 'list'
                    ? 'workbench.session.closeTabsToDown'
                    : 'workbench.session.closeTabsToRight',
                )}
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  for (const candidate of close.sessions) close.onCloseSession(candidate)
                }}
              >
                <ListX strokeWidth={1.5} />
                {t('workbench.session.closeAllTabs')}
              </ContextMenuItem>
            </ContextMenuGroup>
          </>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <ContextMenuItem variant="destructive" onClick={() => onDeleteSession(session)}>
            <Trash2 strokeWidth={1.5} />
            {t('workbench.action.delete')}
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}
