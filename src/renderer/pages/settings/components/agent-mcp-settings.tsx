import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Input } from '@/shadcn/input'
import { Label } from '@/shadcn/label'
import { Spinner } from '@/shadcn/spinner'
import { Switch } from '@/shadcn/switch'
import { Textarea } from '@/shadcn/textarea'
import { toast } from '@/shadcn/toast'

import {
  type AgentMcpServerConfig,
  deleteAgentMcpServer,
  listAgentMcpServers,
  saveAgentMcpServer,
  setAgentCapabilityToggle,
} from '../../../services/claude/agent-config'
import { AgentDetailPage } from './agent-detail-page'
import { AgentEmpty, AgentSection, DeleteButton } from './agent-shared'
import { useSettingsDetailStore } from './settings-detail-store'

const MCP_CATEGORY = 'agent-mcp' as const

/** True when the shared detail view is open for the MCP category. */
function useMcpDetailOpen() {
  const view = useSettingsDetailStore((state) => state.view)
  return view.kind === 'detail' && view.categoryId === MCP_CATEGORY
}

const SERVER_TYPES = ['stdio', 'http', 'sse'] as const

function parseKeyValueBlock(source: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of source.split('\n')) {
    const separator = line.indexOf(line.includes(': ') ? ': ' : '=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + (line.includes(': ') ? 2 : 1)).trim()
    if (key) result[key] = value
  }
  return result
}

function stringifyKeyValueBlock(record: Record<string, string> | undefined): string {
  return Object.entries(record ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

function McpEditor({ draft, onClose }: { draft: AgentMcpServerConfig; onClose: () => void }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(draft)
  const [envText, setEnvText] = useState(stringifyKeyValueBlock(draft.env))
  const [headersText, setHeadersText] = useState(stringifyKeyValueBlock(draft.headers))
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveAgentMcpServer(
        {
          ...form,
          env: form.type === 'stdio' ? parseKeyValueBlock(envText) : undefined,
          headers: form.type !== 'stdio' ? parseKeyValueBlock(headersText) : undefined,
        },
        draft.name || undefined,
      )
      onClose()
    } catch {
      toast.add({ id: 'agent-mcp-save', title: t('settings.agent.saveError'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AgentDetailPage
      title={draft.name || t('settings.agent.mcp.add')}
      descriptionKey="settings.agent.mcp.detailDescription"
      leaf={draft.name ? t('settings.common.edit') : t('settings.agent.mcp.add')}
      formValue={{ form, envText, headersText }}
      isSaving={isSaving}
      isSaveDisabled={!form.name.trim()}
      onSave={() => void handleSave()}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="agent-mcp-name">{t('settings.agent.name')}</Label>
          <Input
            id="agent-mcp-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t('settings.agent.mcp.type')}</Label>
          <div className="flex gap-1">
            {SERVER_TYPES.map((type) => (
              <Button
                key={type}
                size="sm"
                variant={form.type === type ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, type })}
              >
                {type}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {form.type === 'stdio' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-mcp-command">{t('settings.agent.mcp.command')}</Label>
            <Input
              id="agent-mcp-command"
              value={form.command ?? ''}
              onChange={(event) => setForm({ ...form, command: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-mcp-args">{t('settings.agent.mcp.args')}</Label>
            <Input
              id="agent-mcp-args"
              placeholder={t('settings.agent.mcp.argsHint')}
              value={(form.args ?? []).join(' ')}
              onChange={(event) =>
                setForm({ ...form, args: event.target.value.split(' ').filter(Boolean) })
              }
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-mcp-env">{t('settings.agent.mcp.env')}</Label>
            <Textarea
              id="agent-mcp-env"
              placeholder={t('settings.agent.mcp.envHint')}
              value={envText}
              onChange={(event) => setEnvText(event.target.value)}
            />
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-mcp-url">{t('settings.agent.mcp.url')}</Label>
            <Input
              id="agent-mcp-url"
              value={form.url ?? ''}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agent-mcp-headers">{t('settings.agent.mcp.headers')}</Label>
            <Textarea
              id="agent-mcp-headers"
              placeholder={t('settings.agent.mcp.headersHint')}
              value={headersText}
              onChange={(event) => setHeadersText(event.target.value)}
            />
          </div>
        </>
      )}
    </AgentDetailPage>
  )
}

function McpRow({
  server,
  onEdit,
  onDelete,
  onToggle,
}: {
  server: AgentMcpServerConfig
  onEdit: () => void
  onDelete: () => Promise<void> | void
  onToggle: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const summary =
    server.type === 'stdio' ? [server.command, ...(server.args ?? [])].join(' ') : server.url

  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <Switch
        aria-label={t('settings.agent.enabled')}
        checked={!server.disabled}
        onCheckedChange={onToggle}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-normal">{server.name}</span>
          <Badge variant="secondary">{server.type}</Badge>
        </div>
        <div className="truncate text-sm text-foreground-subtle">{summary}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {t('settings.common.edit')}
        </Button>
        <DeleteButton label={server.name} onDelete={onDelete} />
      </div>
    </div>
  )
}

export function AgentMcpSettings() {
  const { t } = useTranslation()
  const [servers, setServers] = useState<AgentMcpServerConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [draft, setDraft] = useState<AgentMcpServerConfig | null>(null)
  const isDetailOpen = useMcpDetailOpen()
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const backToList = useSettingsDetailStore((state) => state.backToList)

  const reload = async () => {
    try {
      setServers(await listAgentMcpServers())
    } catch {
      toast.add({ id: 'agent-mcp-load', title: t('settings.agent.loadError'), type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // Mount-only load; reload reads fresh state on every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = async (server: AgentMcpServerConfig, enabled: boolean) => {
    try {
      await setAgentCapabilityToggle('mcp', server.name, enabled)
      await reload()
    } catch {
      toast.add({ id: 'agent-mcp-toggle', title: t('settings.agent.saveError'), type: 'error' })
    }
  }

  const handleDelete = async (name: string) => {
    try {
      await deleteAgentMcpServer(name)
      backToList()
      await reload()
    } catch {
      toast.add({ id: 'agent-mcp-delete', title: t('settings.agent.deleteError'), type: 'error' })
    }
  }

  const startEdit = (server: AgentMcpServerConfig) => {
    setDraft({ ...server })
    openDetail(MCP_CATEGORY, server.name, t('settings.common.edit'))
  }

  const startCreate = () => {
    setDraft({ name: '', type: 'stdio', command: '', args: [], env: {} })
    openDetail(MCP_CATEGORY, null, t('settings.agent.mcp.add'))
  }

  if (isDetailOpen && draft) {
    return (
      <McpEditor
        draft={draft}
        onClose={() => {
          backToList()
          void reload()
        }}
      />
    )
  }

  return (
    <AgentSection addLabel={t('settings.agent.mcp.add')} onAdd={startCreate} titleKey="mcp">
      <div className="flex flex-col gap-3">
        {isLoading ? (
          <Spinner className="self-center" />
        ) : servers.length === 0 ? (
          <AgentEmpty />
        ) : (
          <div className="divide-y rounded-lg border">
            {servers.map((server) => (
              <McpRow
                key={server.name}
                server={server}
                onDelete={() => handleDelete(server.name)}
                onEdit={() => startEdit(server)}
                onToggle={(enabled) => void handleToggle(server, enabled)}
              />
            ))}
          </div>
        )}
      </div>
    </AgentSection>
  )
}
