import { Keyboard, Pencil, RotateCcw, Search } from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shadcn/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/shadcn/input-group'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shadcn/tooltip'
import { cn } from '@/shadcn/utils'
import type {
  CommandDefinition,
  CommandId,
  ShortcutBinding,
  ShortcutPlatform,
} from '@/shared/shortcuts'

import { ShortcutKeys } from '../../../components/shortcut-keys'
import { localizeCommand } from '../../../i18n/shortcut-command'
import { getEffectiveBindings } from '../../../services/shortcuts/keymap'
import { useShortcutRuntime } from '../../../services/shortcuts/runtime'
import { SettingsList, SettingsRow, markAsRow } from './settings-list'
import { ShortcutRecorder } from './shortcut-recorder'

function ShortcutRowEditButton({ editLabel, onEdit }: { editLabel: string; onEdit: () => void }) {
  return (
    <div className="flex shrink-0 items-center">
      <Button
        aria-label={editLabel}
        className="m-px size-[26px] border"
        size="icon-sm"
        type="button"
        variant="mute"
        onClick={onEdit}
      >
        <Pencil className="size-3.5" strokeWidth={1.5} />
      </Button>
    </div>
  )
}

const ShortcutRow = markAsRow(function ShortcutRow({
  binding,
  definition,
  editLabel,
  hasBinding,
  platform,
  onEdit,
}: {
  binding?: ShortcutBinding
  definition: CommandDefinition
  editLabel: string
  hasBinding: boolean
  platform: ShortcutPlatform
  onEdit: () => void
}) {
  return (
    <SettingsRow className="gap-2 py-2.5" variant="compact">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-normal">{definition.title}</span>
        {definition.description ? (
          <span className="text-xs text-muted-foreground">{definition.description}</span>
        ) : null}
      </div>
      {hasBinding && binding ? <ShortcutKeys binding={binding} platform={platform} /> : null}
      <ShortcutRowEditButton editLabel={editLabel} onEdit={onEdit} />
    </SettingsRow>
  )
})

export function ShortcutSettings({ isActive = true }: { isActive?: boolean } = {}) {
  const { t } = useTranslation()
  const runtime = useShortcutRuntime()
  const snapshot = useSyncExternalStore(
    runtime.overrides.subscribe,
    runtime.overrides.getSnapshot,
    runtime.overrides.getSnapshot,
  )
  const [editingCommandId, setEditingCommandId] = useState<CommandId | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isReloading, setIsReloading] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isToolbarStuck, setIsToolbarStuck] = useState(false)
  const [query, setQuery] = useState('')
  const toolbarRef = useRef<HTMLDivElement>(null)
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase('en-US'))

  useEffect(() => {
    let isActive = true
    void runtime.overrides.initialize().then(() => {
      if (isActive) setLoadError(runtime.overrides.getSnapshot().error)
    })
    return () => {
      isActive = false
    }
  }, [runtime])

  useLayoutEffect(() => {
    const toolbar = toolbarRef.current
    if (!isActive || !toolbar) {
      setIsToolbarStuck(false)
      return
    }

    const viewport = toolbar.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    if (!viewport) {
      setIsToolbarStuck(false)
      return
    }

    const updateToolbarState = () => {
      const isStuck = toolbar.getBoundingClientRect().top <= viewport.getBoundingClientRect().top
      setIsToolbarStuck((current) => (current === isStuck ? current : isStuck))
    }

    updateToolbarState()
    viewport.addEventListener('scroll', updateToolbarState, { passive: true })
    window.addEventListener('resize', updateToolbarState)
    return () => {
      viewport.removeEventListener('scroll', updateToolbarState)
      window.removeEventListener('resize', updateToolbarState)
    }
  }, [isActive])

  const commands = useMemo(
    () =>
      Object.entries(runtime.catalog)
        .map(
          ([commandId, definition]) =>
            [commandId, localizeCommand(commandId, definition, t)] as const,
        )
        .filter(([commandId, definition]) => {
          if (!deferredQuery) return true
          return `${commandId} ${definition.title} ${definition.description ?? ''}`
            .toLocaleLowerCase('en-US')
            .includes(deferredQuery)
        }),
    [deferredQuery, runtime.catalog, t],
  )
  const editingBinding = useMemo(
    () =>
      editingCommandId
        ? getEffectiveBindings(editingCommandId, runtime.catalog, snapshot.overrides)[0]
        : undefined,
    [editingCommandId, runtime.catalog, snapshot.overrides],
  )
  const hasOverrides = Object.keys(snapshot.overrides).length > 0

  const handleReload = async () => {
    setIsReloading(true)
    try {
      await runtime.overrides.initialize()
      setLoadError(runtime.overrides.getSnapshot().error)
    } finally {
      setIsReloading(false)
    }
  }

  const handleResetAll = async () => {
    setIsResetting(true)
    try {
      for (const commandId of Object.keys(snapshot.overrides)) {
        await runtime.overrides.reset(commandId)
      }
    } catch {
      toast.add({
        id: 'settings-shortcut-reset-all-error',
        title: t('common.toast.resetFailed'),
        description: t('settings.shortcut.resetAllError'),
        type: 'error',
      })
    } finally {
      setIsResetting(false)
    }
  }

  if (loadError) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Keyboard />
          </EmptyMedia>
          <EmptyTitle>{t('settings.shortcut.loadError')}</EmptyTitle>
          <EmptyDescription>{t('settings.shortcut.loadErrorDescription')}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            disabled={isReloading}
            type="button"
            variant="outline"
            onClick={() => void handleReload()}
          >
            {isReloading ? <Spinner data-icon="inline-start" /> : null}
            {t('settings.shortcut.reload')}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="sticky top-0 z-10 -mx-px -mt-3 bg-background px-px pt-3" ref={toolbarRef}>
        <div className="flex items-center gap-2">
          <InputGroup className="rounded-full">
            <InputGroupInput
              aria-label={t('settings.shortcut.search')}
              placeholder={t('settings.shortcut.search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
          </InputGroup>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={t('settings.shortcut.resetAll')}
                  className="rounded-full disabled:pointer-events-auto disabled:cursor-not-allowed"
                  disabled={!hasOverrides || isResetting}
                  size="icon"
                  type="button"
                  variant="outline"
                  onClick={() => void handleResetAll()}
                >
                  {isResetting ? <Spinner /> : <RotateCcw />}
                </Button>
              }
            />
            <TooltipContent>{t('settings.shortcut.resetAll')}</TooltipContent>
          </Tooltip>
        </div>
        <div
          className={cn(
            'pointer-events-none absolute -inset-x-px top-full h-10 bg-linear-to-b from-background to-transparent transition-opacity',
            isToolbarStuck ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>

      <SettingsList>
        {commands.length === 0 ? (
          <Empty className="rounded-lg border border-solid">
            <EmptyHeader>
              <EmptyTitle>{t('settings.shortcut.emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('settings.shortcut.emptyDescription')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          commands.map(([commandId, definition]) => {
            const bindings = getEffectiveBindings(commandId, runtime.catalog, snapshot.overrides)
            const firstBinding = bindings[0]

            return (
              <ShortcutRow
                binding={firstBinding}
                definition={definition}
                hasBinding={firstBinding !== undefined}
                key={commandId}
                platform={runtime.platform}
                editLabel={t('settings.shortcut.edit', { command: definition.title })}
                onEdit={() => setEditingCommandId(commandId)}
              />
            )
          })
        )}
      </SettingsList>

      <ShortcutRecorder
        commandId={editingCommandId}
        currentBinding={editingBinding}
        open={editingCommandId !== null}
        onOpenChange={(open) => {
          if (!open) setEditingCommandId(null)
        }}
      />
    </section>
  )
}
