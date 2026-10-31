import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Label } from '@/shadcn/label'
import { Spinner } from '@/shadcn/spinner'
import { Textarea } from '@/shadcn/textarea'
import { toast } from '@/shadcn/toast'

import {
  type AgentHookGroup,
  deleteAgentHookGroup,
  listAgentHookGroups,
  saveAgentHookGroup,
} from '../../../services/claude/agent-config'
import { AgentDetailPage } from './agent-detail-page'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'
import { useSettingsDetailStore } from './settings-detail-store'

const HOOK_CATEGORY = 'agent-hooks' as const

/** True when the shared detail view is open for the hooks category. */
function useHookDetailOpen() {
  const view = useSettingsDetailStore((state) => state.view)
  return view.kind === 'detail' && view.categoryId === HOOK_CATEGORY
}

type HookDraft = {
  /** Empty when creating a new event group. */
  originalEvent: string | null
  event: string
  matcher: string
  commands: Array<{ command: string; timeout: string }>
}

function emptyDraft(): HookDraft {
  return { originalEvent: null, event: '', matcher: '', commands: [{ command: '', timeout: '' }] }
}

function draftFromGroup(group: AgentHookGroup): HookDraft {
  const first = group.entries[0]
  return {
    originalEvent: group.event,
    event: group.event,
    matcher: first?.matcher ?? '',
    commands: (first?.hooks ?? []).map((hook) => ({
      command: hook.command,
      timeout: hook.timeout !== undefined ? String(hook.timeout) : '',
    })),
  }
}

function HookEditor({ draft, onClose }: { draft: HookDraft; onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(draft)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveAgentHookGroup({
        event: form.event,
        entries: [
          {
            matcher: form.matcher,
            hooks: form.commands.map((entry) => ({
              type: 'command' as const,
              command: entry.command,
              ...(entry.timeout.trim() ? { timeout: Number(entry.timeout) } : {}),
            })),
          },
        ],
      })
      onClose()
    } catch {
      toast.add({ id: 'agent-hook-save', title: t('settings.agent.saveError'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  const title = form.event.trim() || t('settings.agent.hooks.add')

  return (
    <AgentDetailPage
      title={title}
      descriptionKey="settings.agent.hooks.detailDescription"
      leaf={draft.event.trim() ? t('settings.common.edit') : t('settings.agent.hooks.add')}
      formValue={form}
      isSaving={isSaving}
      isSaveDisabled={!form.event.trim() || form.commands.some((entry) => !entry.command.trim())}
      onSave={() => void handleSave()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-hook-event">{t('settings.agent.hooks.event')}</Label>
          <Input
            disabled={form.originalEvent !== null}
            id="agent-hook-event"
            placeholder={t('settings.agent.hooks.eventHint')}
            value={form.event}
            onChange={(event) => setForm({ ...form, event: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-hook-matcher">{t('settings.agent.hooks.matcher')}</Label>
          <Input
            id="agent-hook-matcher"
            placeholder={t('settings.agent.hooks.matcherHint')}
            value={form.matcher}
            onChange={(event) => setForm({ ...form, matcher: event.target.value })}
          />
        </div>
      </div>
      {form.commands.map((entry, index) => (
        <div className="flex items-end gap-2" key={index}>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Label htmlFor={`agent-hook-command-${index}`}>
              {t('settings.agent.hooks.command')}
            </Label>
            <Textarea
              className="min-h-9 font-mono"
              id={`agent-hook-command-${index}`}
              rows={1}
              value={entry.command}
              onChange={(event) => {
                const commands = [...form.commands]
                commands[index] = { ...commands[index]!, command: event.target.value }
                setForm({ ...form, commands })
              }}
            />
          </div>
          <div className="flex w-24 flex-col gap-1.5">
            <Label htmlFor={`agent-hook-timeout-${index}`}>
              {t('settings.agent.hooks.timeout')}
            </Label>
            <Input
              id={`agent-hook-timeout-${index}`}
              inputMode="numeric"
              value={entry.timeout}
              onChange={(event) => {
                const commands = [...form.commands]
                commands[index] = { ...commands[index]!, timeout: event.target.value }
                setForm({ ...form, commands })
              }}
            />
          </div>
          {form.commands.length > 1 ? (
            <Button
              aria-label={t('settings.common.delete')}
              size="icon-sm"
              variant="ghost"
              onClick={() =>
                setForm({ ...form, commands: form.commands.filter((_, i) => i !== index) })
              }
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      ))}
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            setForm({ ...form, commands: [...form.commands, { command: '', timeout: '' }] })
          }
        >
          <Plus />
          {t('settings.agent.hooks.addCommand')}
        </Button>
      </div>
    </AgentDetailPage>
  )
}

export function AgentHookSettings() {
  const { t } = useTranslation()
  const [groups, setGroups] = useState<AgentHookGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState<HookDraft | null>(null)
  const isDetailOpen = useHookDetailOpen()
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const backToList = useSettingsDetailStore((state) => state.backToList)

  const reload = async () => {
    try {
      setGroups(await listAgentHookGroups())
    } catch {
      toast.add({ id: 'agent-hooks-load', title: t('settings.agent.loadError'), type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (event: string) => {
    try {
      await deleteAgentHookGroup(event)
      backToList()
      await reload()
    } catch {
      toast.add({ id: 'agent-hook-delete', title: t('settings.agent.deleteError'), type: 'error' })
    }
  }

  const startEdit = (group: AgentHookGroup) => {
    setDraft(draftFromGroup(group))
    openDetail(HOOK_CATEGORY, group.event, t('settings.common.edit'))
  }

  const startCreate = () => {
    setDraft(emptyDraft())
    openDetail(HOOK_CATEGORY, null, t('settings.agent.hooks.add'))
  }

  if (isDetailOpen && draft) {
    return (
      <HookEditor
        draft={draft}
        onClose={() => {
          backToList()
          void reload()
        }}
      />
    )
  }

  return (
    <AgentSection addLabel={t('settings.agent.hooks.add')} onAdd={startCreate} titleKey="hooks">
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <Spinner className="self-center" />
        ) : groups.length === 0 ? (
          <AgentEmpty />
        ) : (
          <div className="divide-y rounded-lg border">
            {groups.map((group) => {
              const commandCount = group.entries.reduce((sum, entry) => sum + entry.hooks.length, 0)
              return (
                <div className="flex min-h-14 items-center gap-3 px-4 py-2" key={group.event}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-normal">{group.event}</div>
                    <div className="truncate text-sm text-foreground-subtle">
                      {commandCount} × command
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => startEdit(group)}>
                      {t('settings.common.edit')}
                    </Button>
                    <DeleteButton label={group.event} onDelete={() => handleDelete(group.event)} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AgentSection>
  )
}
