import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shadcn/dialog'
import { Kbd } from '@/shadcn/kbd'
import { toast } from '@/shadcn/toast'
import type { CommandId, ShortcutBinding } from '@/shared/shortcuts'

import { AppDialog, AppDialogContent } from '../../../components/app-dialog'
import { localizeCommand } from '../../../i18n/shortcut-command'
import { formatShortcutBinding } from '../../../services/shortcuts/bindings'
import { interpretShortcutCapture } from '../../../services/shortcuts/recorder'
import { type ShortcutConflict, findShortcutConflicts } from '../../../services/shortcuts/resolver'
import { useShortcutRuntime } from '../../../services/shortcuts/runtime'

export function ShortcutRecorder({
  commandId,
  currentBinding,
  onOpenChange,
  open,
}: {
  commandId: CommandId | null
  currentBinding?: ShortcutBinding
  onOpenChange: (open: boolean) => void
  open: boolean
}) {
  const { t } = useTranslation()
  const runtime = useShortcutRuntime()
  const captureRef = useRef<HTMLDivElement>(null)
  const [binding, setBinding] = useState<ShortcutBinding | null>(currentBinding ?? null)
  const [conflicts, setConflicts] = useState<ShortcutConflict[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hasChange, setHasChange] = useState(false)
  const [isSaving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setBinding(currentBinding ?? null)
    setConflicts([])
    setError(null)
    setHasChange(false)
    const endCapture = runtime.capture.begin()
    requestAnimationFrame(() => captureRef.current?.focus())
    return endCapture
  }, [commandId, currentBinding, open, runtime])

  if (!commandId) return null

  const currentCommandId = commandId
  const definition = localizeCommand(currentCommandId, runtime.catalog[currentCommandId], t)
  const hardConflict = conflicts.find((conflict) => conflict.type === 'hard')
  const shadowConflict = conflicts.find((conflict) => conflict.type === 'shadow')

  function handleKeyDown(event: React.KeyboardEvent) {
    const result = interpretShortcutCapture(event.nativeEvent, runtime.platform)
    if (result.type === 'wait') return

    event.preventDefault()
    event.stopPropagation()
    setError(null)

    if (result.type === 'cancel') {
      onOpenChange(false)
      return
    }
    if (result.type === 'clear') {
      setBinding(null)
      setConflicts([])
      setHasChange(true)
      return
    }
    if (result.type === 'invalid') {
      setError(t('settings.shortcuts.requiresModifier'))
      return
    }

    setBinding(result.binding)
    setConflicts(
      findShortcutConflicts({
        binding: result.binding,
        catalog: runtime.catalog,
        commandId: currentCommandId,
        overrides: runtime.overrides.getSnapshot().overrides,
        platform: runtime.platform,
      }),
    )
    setHasChange(true)
  }

  async function handleSave() {
    if (!hasChange || hardConflict) return
    setSaving(true)
    setError(null)
    try {
      await runtime.overrides.set(currentCommandId, binding ? [binding] : [])
      onOpenChange(false)
    } catch {
      toast.add({
        id: 'settings-shortcut-save-error',
        title: t('common.toast.saveFailed'),
        description: t('settings.shortcut.saveError'),
        type: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange}>
      <AppDialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.shortcut.editorTitle')}</DialogTitle>
          <DialogDescription>{definition.title}</DialogDescription>
        </DialogHeader>

        <div
          ref={captureRef}
          aria-label={t('settings.shortcut.captureAria')}
          className="flex min-h-16 items-center justify-center rounded-lg border bg-muted/30 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          tabIndex={0}
          onKeyDown={handleKeyDown}
        >
          {binding ? (
            <Kbd>{formatShortcutBinding(binding, runtime.platform)}</Kbd>
          ) : (
            <span className="text-xs text-muted-foreground">{t('settings.shortcut.capture')}</span>
          )}
        </div>

        {hardConflict ? (
          <p className="text-xs text-destructive">
            {t('settings.shortcut.conflict', {
              command: runtime.catalog[hardConflict.commandId]
                ? localizeCommand(
                    hardConflict.commandId,
                    runtime.catalog[hardConflict.commandId],
                    t,
                  ).title
                : hardConflict.commandId,
            })}
          </p>
        ) : null}
        {!hardConflict && shadowConflict ? (
          <p className="text-xs text-muted-foreground">
            {t('settings.shortcut.override', {
              command: runtime.catalog[shadowConflict.commandId]
                ? localizeCommand(
                    shadowConflict.commandId,
                    runtime.catalog[shadowConflict.commandId],
                    t,
                  ).title
                : shadowConflict.commandId,
            })}
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('settings.common.cancel')}
          </Button>
          <Button disabled={!hasChange || Boolean(hardConflict) || isSaving} onClick={handleSave}>
            {t('settings.common.save')}
          </Button>
        </DialogFooter>
      </AppDialogContent>
    </AppDialog>
  )
}
