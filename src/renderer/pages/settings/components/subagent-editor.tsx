import type { TFunction } from 'i18next'
import { ChevronDown } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Checkbox } from '@/shadcn/checkbox'
import { Input } from '@/shadcn/input'
import { Label } from '@/shadcn/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shadcn/select'
import { Spinner } from '@/shadcn/spinner'
import { Switch } from '@/shadcn/switch'
import { Textarea } from '@/shadcn/textarea'
import { toast } from '@/shadcn/toast'
import { cn } from '@/shadcn/utils'

import { type AgentSubagentConfig, saveAgentSubagent } from '../../../services/claude/agent-config'
import { DeleteConfirmButton, capitalize } from './agent-shared'
import { useSettingsDetailStore } from './settings-detail-store'
import { useDetailDirty } from './use-detail-dirty'

/** Common tools shown as checkboxes; other entries in `tools` pass through on save. */
const GRID_TOOLS = [
  'Read',
  'Grep',
  'Glob',
  'Bash',
  'Edit',
  'Write',
  'WebFetch',
  'WebSearch',
  'TodoWrite',
] as const

const MODEL_OPTIONS = ['sonnet', 'opus', 'haiku', 'inherit'] as const
const PERMISSION_MODES = ['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan']
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']
const MEMORIES = ['user', 'project', 'local']
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan']

/**
 * UI label for an enum option: the translated `option.*` key when present,
 * else the capitalized raw value (a hand-written unknown stays round-trippable,
 * design D3). Storage keeps the lowercase literal.
 */
function optionLabel(t: TFunction, option: string): string {
  const key = `settings.agent.subagent.option.${option}`
  return t(key, { defaultValue: capitalize(option) })
}

/** Editor state; tools mode is UI-only (design D2): `all` omits the tools key. */
type ToolsMode = 'all' | 'custom'

function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function toolsModeOf(tools: string | undefined): ToolsMode {
  return tools && splitList(tools).length > 0 ? 'custom' : 'all'
}

/** Checked grid names + every non-grid entry already in `tools` (design D2). */
function serializeTools(
  mode: ToolsMode,
  checked: Set<string>,
  original: string | undefined,
): string | undefined {
  if (mode === 'all') return undefined
  const passThrough = splitList(original).filter(
    (entry) => !(GRID_TOOLS as readonly string[]).includes(entry),
  )
  const merged = [...checked, ...passThrough]
  return merged.length > 0 ? merged.join(', ') : undefined
}

function SelectField({
  id,
  label,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  id: string
  label: string
  value: string | undefined
  options: readonly string[]
  emptyLabel: string
  onChange: (value: string | undefined) => void
}) {
  const { t } = useTranslation()
  const items = [
    { value: '', label: emptyLabel },
    // A hand-written value outside the enum stays selectable so it round-trips (design D3).
    ...(!value || options.includes(value) || value === '' ? [] : [{ value, label: value }]),
    ...options.map((option) => ({ value: option, label: optionLabel(t, option) })),
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="font-normal" htmlFor={id}>
        {label}
      </Label>
      <Select
        items={items}
        value={value ?? ''}
        onValueChange={(next: string | null) => onChange(next ? next : undefined)}
      >
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false} align="end">
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function SwitchField({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <Label className="font-normal">{label}</Label>
        {hint ? <p className="text-xs text-foreground-subtlest">{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function ToolsGrid({
  checked,
  onToggle,
}: {
  checked: Set<string>
  onToggle: (tool: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-0.5 rounded-lg border p-1 sm:grid-cols-3">
      {GRID_TOOLS.map((tool) => (
        <label
          key={tool}
          className="flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background-subtle"
        >
          <Checkbox checked={checked.has(tool)} onCheckedChange={() => onToggle(tool)} />
          {tool}
        </label>
      ))}
    </div>
  )
}

function AdvancedOptions({
  form,
  setForm,
}: {
  form: AgentSubagentConfig
  setForm: (next: AgentSubagentConfig) => void
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<ToolsMode>(toolsModeOf(form.tools))
  const [checkedTools, setCheckedTools] = useState<Set<string>>(
    () =>
      new Set(
        splitList(form.tools).filter((entry) => (GRID_TOOLS as readonly string[]).includes(entry)),
      ),
  )
  const set = (patch: Partial<AgentSubagentConfig>) => setForm({ ...form, ...patch })

  const setCount = [
    form.model,
    form.permissionMode,
    form.effort,
    form.maxTurns,
    form.tools,
    form.disallowedTools,
    form.skills,
    form.background,
    form.omitClaudeMd,
    form.memory,
    form.isolation,
    form.color,
  ].filter((value) => value !== undefined && value !== false).length

  const [isOpen, setIsOpen] = useState(setCount > 0)

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        className="flex items-center gap-1.5 text-sm font-normal text-foreground"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronDown className={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')} />
        {t('settings.agent.subagent.advanced')}
        <span className="text-xs font-normal text-foreground-subtlest">
          {t('settings.agent.subagent.setCount', { count: setCount })}
        </span>
      </button>
      {isOpen ? (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="agent-subagent-model"
              label={t('settings.agent.model')}
              value={form.model}
              options={MODEL_OPTIONS}
              emptyLabel={t('settings.agent.subagent.option.default')}
              onChange={(model) => set({ model })}
            />
            <SelectField
              id="agent-subagent-permission"
              label={t('settings.agent.subagent.permissionMode')}
              value={form.permissionMode}
              options={PERMISSION_MODES}
              emptyLabel={t('settings.agent.subagent.inherit')}
              onChange={(permissionMode) => set({ permissionMode })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="agent-subagent-effort"
              label={t('settings.agent.subagent.effort')}
              value={form.effort}
              options={EFFORTS}
              emptyLabel={t('settings.agent.subagent.inherit')}
              onChange={(effort) => set({ effort })}
            />
            <div className="flex flex-col gap-1.5">
              <Label className="font-normal" htmlFor="agent-subagent-max-turns">
                {t('settings.agent.subagent.maxTurns')}
              </Label>
              <Input
                id="agent-subagent-max-turns"
                type="number"
                min={1}
                placeholder={t('settings.agent.subagent.unlimited')}
                value={form.maxTurns ?? ''}
                onChange={(event) => set({ maxTurns: event.target.value || undefined })}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="font-normal" htmlFor="agent-subagent-tools">
              {t('settings.agent.tools')}
            </Label>
            <div className="flex items-center gap-3">
              <Select
                items={[
                  { value: 'all', label: t('settings.agent.subagent.toolsAll') },
                  { value: 'custom', label: t('settings.agent.subagent.toolsCustom') },
                ]}
                value={mode}
                onValueChange={(next: string | null) => {
                  if (next === 'all' || next === 'custom') {
                    setMode(next)
                    set({ tools: serializeTools(next, checkedTools, form.tools) })
                  }
                }}
              >
                <SelectTrigger
                  id="agent-subagent-tools"
                  aria-label={t('settings.agent.tools')}
                  className="w-40"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} align="end">
                  <SelectGroup>
                    <SelectItem value="all">{t('settings.agent.subagent.toolsAll')}</SelectItem>
                    <SelectItem value="custom">
                      {t('settings.agent.subagent.toolsCustom')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <span className="text-xs text-foreground-subtlest">
                {t('settings.agent.subagent.toolsHint')}
              </span>
            </div>
            {mode === 'custom' ? (
              <div className="mt-1">
                <ToolsGrid
                  checked={checkedTools}
                  onToggle={(tool) => {
                    const next = new Set(checkedTools)
                    if (next.has(tool)) next.delete(tool)
                    else next.add(tool)
                    setCheckedTools(next)
                    set({ tools: serializeTools(mode, next, form.tools) })
                  }}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="font-normal" htmlFor="agent-subagent-disallowed">
              {t('settings.agent.subagent.disallowedTools')}
            </Label>
            <Input
              id="agent-subagent-disallowed"
              value={form.disallowedTools ?? ''}
              placeholder="Bash(git push *)"
              onChange={(event) => set({ disallowedTools: event.target.value || undefined })}
            />
            <p className="text-xs text-foreground-subtlest">
              {t('settings.agent.subagent.disallowedHint')}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="font-normal" htmlFor="agent-subagent-skills">
              {t('settings.agent.subagent.skills')}
            </Label>
            <Input
              id="agent-subagent-skills"
              value={form.skills ?? ''}
              placeholder={t('settings.agent.subagent.skillsHint')}
              onChange={(event) => set({ skills: event.target.value || undefined })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SwitchField
              label={t('settings.agent.subagent.background')}
              hint={t('settings.agent.subagent.backgroundHint')}
              checked={form.background === true}
              onCheckedChange={(background) => set({ background: background || undefined })}
            />
            <SwitchField
              label={t('settings.agent.subagent.omitClaudeMd')}
              hint={t('settings.agent.subagent.omitClaudeMdHint')}
              checked={form.omitClaudeMd === true}
              onCheckedChange={(omitClaudeMd) => set({ omitClaudeMd: omitClaudeMd || undefined })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              id="agent-subagent-memory"
              label={t('settings.agent.subagent.memory')}
              value={form.memory}
              options={MEMORIES}
              emptyLabel={t('settings.agent.subagent.none')}
              onChange={(memory) => set({ memory })}
            />
            <SelectField
              id="agent-subagent-color"
              label={t('settings.agent.subagent.color')}
              value={form.color}
              options={COLORS}
              emptyLabel={t('settings.agent.subagent.none')}
              onChange={(color) => set({ color })}
            />
          </div>
          <div className="sm:max-w-[calc(50%-1rem)]">
            <SwitchField
              label={t('settings.agent.subagent.isolation')}
              hint={t('settings.agent.subagent.isolationHint')}
              checked={form.isolation === 'worktree'}
              onCheckedChange={(isolation) =>
                set({ isolation: isolation ? 'worktree' : undefined })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function SubagentEditor({
  draft,
  onDelete,
}: {
  draft: AgentSubagentConfig
  onDelete?: (file: string) => Promise<void> | void
}) {
  const { t } = useTranslation()
  const [form, setForm] = useState(draft)
  const [isSaving, setIsSaving] = useState(false)
  const isNew = draft.file === ''
  const requestLeave = useSettingsDetailStore((state) => state.requestLeave)
  const backToList = useSettingsDetailStore((state) => state.backToList)
  const setLeaf = useSettingsDetailStore((state) => state.setLeaf)

  // Dirty = current form differs from the snapshot taken at mount.
  useDetailDirty(form)

  const title = isNew ? t('settings.agent.subagent.new') : draft.name || draft.file

  // The breadcrumb leaf is fixed at open time; the store already holds it
  // from openDetail, so no per-keystroke sync here.
  useEffect(() => () => setLeaf(''), [setLeaf])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await saveAgentSubagent({ ...form, file: form.file || (form.name ?? '').trim() })
      backToList()
    } catch {
      toast.add({ id: 'agent-subagent-save', title: t('settings.agent.saveError'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium tracking-tight">{title}</h1>
        <p className="text-sm text-foreground-subtlest">
          {t('settings.agent.subagent.detailDescription')}
        </p>
      </header>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label className="font-normal" htmlFor="agent-subagent-name">
            {t('settings.agent.name')}
          </Label>
          <Input
            id="agent-subagent-name"
            value={form.name ?? ''}
            placeholder={t('settings.agent.subagent.namePlaceholder')}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="font-normal" htmlFor="agent-subagent-description">
            {t('settings.agent.description')}
          </Label>
          <Textarea
            id="agent-subagent-description"
            className="min-h-14 resize-none"
            value={form.description ?? ''}
            placeholder={t('settings.agent.subagent.descriptionPlaceholder')}
            onChange={(event) =>
              setForm({ ...form, description: event.target.value.replace(/\n/g, '') })
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.preventDefault()
            }}
          />
        </div>
        <AdvancedOptions form={form} setForm={setForm} />
        <div className="flex flex-col gap-1.5">
          <Label className="font-normal" htmlFor="agent-subagent-body">
            {t('settings.agent.prompt')}
          </Label>
          <Textarea
            className="min-h-40 font-mono"
            id="agent-subagent-body"
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
          />
        </div>
        <div className="flex items-center gap-2">
          {!isNew && onDelete ? (
            <DeleteConfirmButton
              className="mr-auto"
              label={t('settings.common.delete')}
              onDelete={() => onDelete(draft.file)}
            />
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={requestLeave}>
              {t('settings.common.cancel')}
            </Button>
            <Button disabled={isSaving || !form.name?.trim()} onClick={() => void handleSave()}>
              {isSaving ? <Spinner /> : null}
              {t('settings.common.save')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
