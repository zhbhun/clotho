import { ChevronRight, Puzzle, Sparkles, User } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Spinner } from '@/shadcn/spinner'
import { toast } from '@/shadcn/toast'

import {
  type AgentSubagentConfig,
  deleteAgentSubagent,
  listAgentAvailableSubagents,
  listAgentSubagents,
} from '../../../services/claude/agent-config'
import { AgentEmpty, DeleteButton } from './agent-shared'
import { SubagentEditor } from './subagent-editor'

const SOURCES = ['builtin', 'plugin', 'custom'] as const
type Source = (typeof SOURCES)[number]

const SOURCE_ICON = {
  builtin: Sparkles,
  plugin: Puzzle,
  custom: User,
} as const

function SourceBadge({ source }: { source: Source }) {
  const { t } = useTranslation()
  const Icon = SOURCE_ICON[source]
  const label = t(`settings.agent.subagent.badge.${source}`)
  return (
    <span
      className="flex shrink-0 items-center rounded border p-1 text-foreground-subtle"
      title={label}
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  )
}

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
  const isReadOnly = subagent.builtin === true
  const modelLabel = subagent.model
    ? subagent.model.charAt(0).toUpperCase() + subagent.model.slice(1)
    : t('settings.agent.subagent.modelDefault')

  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3">
      {subagent.source ? <SourceBadge source={subagent.source} /> : null}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-normal leading-snug">
          {subagent.name || subagent.file}
        </div>
        <div className="truncate text-sm leading-snug text-foreground-subtlest">
          {subagent.broken ? t('settings.agent.broken') : subagent.description}
        </div>
      </div>
      <span className="shrink-0 text-sm text-foreground-subtlest">{modelLabel}</span>
      {!isReadOnly ? (
        // A broken file cannot open in the editor; the row delete button is
        // its only removal path (rpc.ts: broken files are "only deletable").
        subagent.broken ? (
          <DeleteButton label={subagent.file} onDelete={onDelete} />
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('settings.common.edit')}
            onClick={onEdit}
          >
            <ChevronRight />
          </Button>
        )
      ) : null}
    </div>
  )
}

function sourceOf(subagent: AgentSubagentConfig): Source {
  return subagent.source ?? 'custom'
}

function SourceCard({
  source,
  rows,
  hiddenFile,
  onEdit,
  onDelete,
}: {
  source: Source
  rows: AgentSubagentConfig[]
  hiddenFile: string | null
  onEdit: (subagent: AgentSubagentConfig) => void
  onDelete: (file: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  return (
    <div data-source-card={source} className="flex flex-col gap-2">
      <div className="text-sm text-foreground-subtlest">
        {t(`settings.agent.subagent.badge.${source}`)}
      </div>
      {rows.length === 0 ? (
        <AgentEmpty />
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((subagent) =>
            subagent.file === hiddenFile ? null : (
              <SubagentRow
                key={`${sourceOf(subagent)}:${subagent.file}`}
                subagent={subagent}
                onEdit={() => onEdit(subagent)}
                onDelete={() => onDelete(subagent.file)}
              />
            ),
          )}
        </div>
      )}
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
      setSubagents(await listAgentAvailableSubagents())
    } catch {
      // Fallback path: the SDK resolve failed on the main side; show the plain
      // file list so custom agents stay manageable (design D5).
      try {
        setSubagents(await listAgentSubagents())
        toast.add({
          id: 'agent-subagents-refresh',
          title: t('settings.agent.subagent.refreshError'),
          type: 'error',
        })
      } catch {
        toast.add({
          id: 'agent-subagents-load',
          title: t('settings.agent.loadError'),
          type: 'error',
        })
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDeleteAndClose = async (file: string) => {
    try {
      await deleteAgentSubagent(file)
      setDraft(null)
      await reload()
    } catch {
      toast.add({
        id: 'agent-subagent-delete',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  // Row delete keeps the editor open; it never targets the file being edited.
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

  const bySource = (source: Source) => subagents.filter((subagent) => sourceOf(subagent) === source)

  return (
    <section className="flex flex-col gap-3">
      <div className="flex min-h-7 items-center justify-between gap-4">
        <h2 className="text-sm font-medium">
          {t('settings.agent.subagent.installed')}{' '}
          <span className="text-foreground-subtlest">
            {t('settings.agent.subagent.itemCount', { count: subagents.length })}
          </span>
        </h2>
        <Button variant="outline" onClick={startCreate}>
          {t('settings.agent.subagent.add')}
        </Button>
      </div>
      {draft ? (
        <SubagentEditor
          draft={draft}
          onClose={() => {
            setDraft(null)
            void reload()
          }}
          onDelete={handleDeleteAndClose}
        />
      ) : null}
      {isLoading ? (
        <Spinner className="self-center" />
      ) : (
        <div className="flex flex-col gap-8">
          {SOURCES.map((source) => (
            <SourceCard
              key={source}
              source={source}
              rows={bySource(source)}
              hiddenFile={fileBeingEdited}
              onEdit={startEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </section>
  )
}
