import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Label } from '@/shadcn/label'
import { Spinner } from '@/shadcn/spinner'
import { Textarea } from '@/shadcn/textarea'
import { toast } from '@/shadcn/toast'

import {
  type AgentSubagentConfig,
  deleteAgentSubagent,
  listAgentSubagents,
  saveAgentSubagent,
} from '../../../services/claude/agent-config'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'

function SubagentRow({
  subagent,
  onEdit,
  onDelete,
}: {
  subagent: AgentSubagentConfig
  onEdit: () => void
  onDelete: () => Promise<void> | void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-normal">{subagent.name || subagent.file}</div>
        <div className="truncate text-sm text-foreground-subtle">
          {subagent.broken ? t('settings.agent.broken') : subagent.description}
        </div>
      </div>
      {subagent.model ? (
        <span className="shrink-0 text-sm text-foreground-subtlest">{subagent.model}</span>
      ) : null}
      <div className="flex shrink-0 items-center gap-1">
        {!subagent.broken ? (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            {t('settings.common.edit')}
          </Button>
        ) : null}
        <DeleteButton label={subagent.file} onDelete={onDelete} />
      </div>
    </div>
  )
}

function SubagentEditor({ draft, onClose }: { draft: AgentSubagentConfig; onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(draft)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveAgentSubagent({ ...form, file: form.file || (form.name ?? '').trim() })
      onClose()
    } catch {
      toast.add({ id: 'agent-subagent-save', title: t('settings.agent.saveError'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-subagent-name">{t('settings.agent.name')}</Label>
          <Input
            id="agent-subagent-name"
            value={form.name ?? ''}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <p className="text-xs text-foreground-subtlest">
            {t('settings.agent.subagent.nameHint')}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-subagent-model">{t('settings.agent.model')}</Label>
          <Input
            id="agent-subagent-model"
            placeholder="sonnet"
            value={form.model ?? ''}
            onChange={(event) => setForm({ ...form, model: event.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-subagent-description">{t('settings.agent.description')}</Label>
        <Input
          id="agent-subagent-description"
          value={form.description ?? ''}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-subagent-tools">{t('settings.agent.tools')}</Label>
        <Input
          id="agent-subagent-tools"
          value={form.tools ?? ''}
          onChange={(event) => setForm({ ...form, tools: event.target.value })}
        />
        <p className="text-xs text-foreground-subtlest">{t('settings.agent.subagent.toolsHint')}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-subagent-body">{t('settings.agent.prompt')}</Label>
        <Textarea
          className="min-h-40 font-mono"
          id="agent-subagent-body"
          value={form.body}
          onChange={(event) => setForm({ ...form, body: event.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {t('settings.common.cancel')}
        </Button>
        <Button disabled={isSaving || !form.name?.trim()} onClick={() => void handleSave()}>
          {isSaving ? <Spinner /> : null}
          {t('settings.common.save')}
        </Button>
      </div>
    </div>
  )
}

export function AgentSubagentSettings() {
  const { t } = useTranslation()
  const [subagents, setSubagents] = useState<AgentSubagentConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState<AgentSubagentConfig | null>(null)
  const [fileBeingEdited, setFileBeingEdited] = useState<string | null>(null)

  const reload = async () => {
    try {
      setSubagents(await listAgentSubagents())
    } catch {
      toast.add({ id: 'agent-subagents-load', title: t('settings.agent.loadError'), type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDelete = async (file: string) => {
    try {
      await deleteAgentSubagent(file)
      await reload()
    } catch {
      toast.add({
        id: 'agent-subagent-delete',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  const startEdit = (subagent: AgentSubagentConfig) => {
    setFileBeingEdited(subagent.file)
    setDraft({ ...subagent })
  }

  const startCreate = () => {
    setFileBeingEdited(null)
    setDraft({ file: '', name: '', description: '', body: '' })
  }

  return (
    <AgentSection
      addLabel={
        draft === null || fileBeingEdited !== null ? t('settings.agent.subagent.add') : undefined
      }
      onAdd={draft === null || fileBeingEdited !== null ? startCreate : undefined}
      titleKey="subagents"
    >
      <div className="flex flex-col gap-3">
        {draft ? (
          <SubagentEditor
            draft={draft}
            onClose={() => {
              setDraft(null)
              void reload()
            }}
          />
        ) : null}
        {isLoading ? (
          <Spinner className="self-center" />
        ) : subagents.length === 0 ? (
          <AgentEmpty />
        ) : (
          <div className="divide-y rounded-lg border">
            {subagents.map((subagent) =>
              subagent.file === fileBeingEdited ? null : (
                <SubagentRow
                  key={subagent.file}
                  subagent={subagent}
                  onDelete={() => handleDelete(subagent.file)}
                  onEdit={() => startEdit(subagent)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </AgentSection>
  )
}
