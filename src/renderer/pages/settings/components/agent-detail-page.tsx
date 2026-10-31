import { type ReactNode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Spinner } from '@/shadcn/spinner'

import type { MessageKey } from '../../../i18n/resources'
import { DeleteConfirmButton } from './agent-shared'
import { useSettingsDetailStore } from './settings-detail-store'
import { useDetailDirty } from './use-detail-dirty'

/**
 * Shared second-level detail page for the agent-capability editors: an h1
 * header with a description line, the editor form, and a footer row with
 * Cancel/Save right-aligned. Wires the form value into the shared dirty
 * guard and keeps the breadcrumb leaf following the name field.
 */
export function AgentDetailPage({
  title,
  descriptionKey,
  leaf,
  formValue,
  isSaving,
  isSaveDisabled,
  canDelete = false,
  onDelete,
  onCancel,
  onSave,
  children,
}: {
  title: string
  descriptionKey: MessageKey
  /** Breadcrumb leaf, fixed at open time (the entry name or create label). */
  leaf: string
  /** Current form state; dirty = differs from the mount snapshot. */
  formValue: unknown
  isSaving?: boolean
  isSaveDisabled?: boolean
  canDelete?: boolean
  onDelete?: () => void
  /** Defaults to the shared leave gate (confirms when dirty). */
  onCancel?: () => void
  onSave: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  useDetailDirty(formValue)
  const setLeaf = useSettingsDetailStore((state) => state.setLeaf)
  const requestLeave = useSettingsDetailStore((state) => state.requestLeave)

  // The leaf is fixed at open time; typing in the form never moves the
  // breadcrumb, so this intentionally runs once on mount.
  useEffect(() => {
    setLeaf(leaf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="flex flex-col gap-6" data-agent-detail-page>
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium tracking-tight">{title}</h1>
        <p className="text-sm text-foreground-subtlest">{t(descriptionKey)}</p>
      </header>
      <div className="flex flex-col gap-4">
        {children}
        <div className="flex items-center gap-2">
          {canDelete && onDelete ? (
            <DeleteConfirmButton
              className="mr-auto"
              label={t('settings.common.delete')}
              onDelete={onDelete}
            />
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={onCancel ?? requestLeave}>
              {t('settings.common.cancel')}
            </Button>
            <Button disabled={isSaving || isSaveDisabled} onClick={onSave}>
              {isSaving ? <Spinner /> : null}
              {t('settings.common.save')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
