import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Label } from '@/shadcn/label'
import { Spinner } from '@/shadcn/spinner'
import { Textarea } from '@/shadcn/textarea'
import { toast } from '@/shadcn/toast'

import {
  type AgentWorkflowInfo,
  deleteAgentWorkflow,
  listAgentWorkflows,
  readAgentWorkflow,
  renameAgentWorkflow,
  saveAgentWorkflow,
} from '../../../services/claude/agent-config'
import { AgentDetailPage } from './agent-detail-page'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'
import { useSettingsDetailStore } from './settings-detail-store'

function formatTime(ms: number) {
  return new Date(ms).toLocaleString()
}

const WORKFLOW_CATEGORY = 'agent-workflows' as const

/** True when the shared detail view is open for the workflows category. */
function useWorkflowDetailOpen() {
  const view = useSettingsDetailStore((state) => state.view)
  return view.kind === 'detail' && view.categoryId === WORKFLOW_CATEGORY
}

function WorkflowEditor({
  draft,
  onClose,
}: {
  draft: { name: string; content: string }
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(draft.name)
  const [content, setContent] = useState(draft.content)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveAgentWorkflow(name, content)
      if (draft.name && draft.name !== name) await renameAgentWorkflow(draft.name, name)
      onClose()
    } catch {
      toast.add({ id: 'agent-workflow-save', title: t('settings.agent.saveError'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AgentDetailPage
      title={draft.name || t('settings.agent.workflows.add')}
      descriptionKey="settings.agent.workflows.detailDescription"
      leaf={draft.name ? t('settings.common.edit') : t('settings.agent.workflows.add')}
      formValue={{ name, content }}
      isSaving={isSaving}
      isSaveDisabled={!name.trim()}
      onSave={() => void handleSave()}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-workflow-name">{t('settings.agent.name')}</Label>
        <Input
          id="agent-workflow-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-workflow-content">{t('settings.agent.workflows.content')}</Label>
        <Textarea
          className="min-h-56 font-mono"
          id="agent-workflow-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>
    </AgentDetailPage>
  )
}

export function AgentWorkflowSettings() {
  const { t } = useTranslation()
  const [workflows, setWorkflows] = useState<AgentWorkflowInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState<{ name: string; content: string } | null>(null)
  const isDetailOpen = useWorkflowDetailOpen()
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const backToList = useSettingsDetailStore((state) => state.backToList)

  const reload = async () => {
    try {
      setWorkflows(await listAgentWorkflows())
    } catch {
      toast.add({ id: 'agent-workflows-load', title: t('settings.agent.loadError'), type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startEdit = async (name: string) => {
    try {
      const { content } = await readAgentWorkflow(name)
      setDraft({ name, content })
      openDetail(WORKFLOW_CATEGORY, name, t('settings.common.edit'))
    } catch {
      toast.add({ id: 'agent-workflow-read', title: t('settings.agent.loadError'), type: 'error' })
    }
  }

  const startCreate = () => {
    setDraft({ name: '', content: '' })
    openDetail(WORKFLOW_CATEGORY, null, t('settings.agent.workflows.add'))
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteAgentWorkflow(name)
      backToList()
      await reload()
    } catch {
      toast.add({
        id: 'agent-workflow-delete',
        title: t('settings.agent.deleteError'),
        type: 'error',
      })
    }
  }

  if (isDetailOpen && draft) {
    return (
      <WorkflowEditor
        draft={draft}
        onClose={() => {
          backToList()
          void reload()
        }}
      />
    )
  }

  return (
    <AgentSection
      addLabel={t('settings.agent.workflows.add')}
      onAdd={startCreate}
      titleKey="workflows"
    >
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <Spinner className="self-center" />
        ) : workflows.length === 0 ? (
          <AgentEmpty />
        ) : (
          <div className="divide-y rounded-lg border">
            {workflows.map((workflow) => (
              <div className="flex min-h-14 items-center gap-3 px-4 py-2" key={workflow.name}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-normal">{workflow.name}</div>
                  <div className="truncate text-sm text-foreground-subtle">
                    {t('settings.agent.workflows.modified')}: {formatTime(workflow.lastModifiedMs)}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => void startEdit(workflow.name)}>
                    {t('settings.common.edit')}
                  </Button>
                  <DeleteButton
                    label={workflow.name}
                    onDelete={() => handleDelete(workflow.name)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AgentSection>
  )
}
