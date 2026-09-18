import { type JSONContent, Node, mergeAttributes } from '@tiptap/core'
import { type NodeViewProps, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { type Ref, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/shadcn/popover'
import { cn } from '@/shadcn/utils'

import type { ClaudeSlashCommand } from '../../../../services/claude/claude'
import type { SlashCommandMenuPlacement } from './menu-position'

export type SlashCommandMenuPosition = {
  left: number
  top: number
}

const PREVIEW_CLOSE_DELAY = 100
const PREVIEW_DELAY = 300

function commandTooltip(command: Pick<ClaudeSlashCommand, 'description' | 'name'>) {
  return command.description?.trim() || command.name
}

function commandTitle(name: string) {
  const segment = name.split(':').at(-1)?.trim() || name
  return segment.replace(/[-_]+/g, ' ').replace(/(^|\s)\S/g, (match) => match.toUpperCase())
}

function highlightedName(name: string, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return <span>{name}</span>

  const matchIndex = name.toLowerCase().indexOf(normalizedQuery)
  if (matchIndex < 0) return <span>{name}</span>

  const before = name.slice(0, matchIndex)
  const match = name.slice(matchIndex, matchIndex + normalizedQuery.length)
  const after = name.slice(matchIndex + normalizedQuery.length)

  return (
    <>
      {before ? <span className="text-foreground-subtle">{before}</span> : null}
      <span data-command-match="true">{match}</span>
      {after ? <span className="text-foreground-subtle">{after}</span> : null}
    </>
  )
}

function SlashCommandView({ node }: NodeViewProps) {
  const name = typeof node.attrs.name === 'string' ? node.attrs.name : ''
  const description =
    typeof node.attrs.description === 'string' ? node.attrs.description : undefined

  return (
    <NodeViewWrapper
      as="span"
      className="inline align-baseline leading-6"
      contentEditable={false}
      data-slash-command=""
    >
      {'\u200b'}
      <Popover>
        <PopoverTrigger
          closeDelay={PREVIEW_CLOSE_DELAY}
          delay={PREVIEW_DELAY}
          nativeButton={false}
          openOnHover
          render={
            <span
              aria-label={`/${name}`}
              className="mx-0.5 inline-flex h-6 max-w-64 items-center rounded-md bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_8%)] px-1.5 align-top leading-6 transition-colors hover:bg-[color-mix(in_oklab,var(--secondary),var(--foreground)_12%)]"
              data-pointer-cursor-target=""
            />
          }
        >
          /{name}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 gap-0 p-3" side="top" sideOffset={6}>
          <PopoverHeader className="gap-1.5">
            <PopoverTitle className="text-foreground">{commandTitle(name)}</PopoverTitle>
            {description ? (
              <PopoverDescription className="text-foreground-subtle">
                {description}
              </PopoverDescription>
            ) : null}
          </PopoverHeader>
        </PopoverContent>
      </Popover>
      {'\u200b'}
    </NodeViewWrapper>
  )
}

export const SlashCommand = Node.create({
  name: 'slashCommand',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      aliases: { default: [] },
      argumentHint: { default: undefined },
      description: { default: undefined },
      name: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-slash-command]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-slash-command': '',
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SlashCommandView, { className: 'inline-block' })
  },
})

export function slashCommandToNode(command: ClaudeSlashCommand): JSONContent {
  return {
    type: 'slashCommand',
    attrs: {
      aliases: command.aliases ?? [],
      argumentHint: command.argumentHint,
      description: command.description,
      name: command.name,
    },
  }
}

const DIRECT_SLASH_COMMAND_NAMES = ['clear', 'compact', 'config', 'context', 'rename'] as const

export type DirectSlashCommandName = (typeof DIRECT_SLASH_COMMAND_NAMES)[number]

const DIRECT_SLASH_COMMANDS = new Set<string>(DIRECT_SLASH_COMMAND_NAMES)

export function resolveDirectSlashCommand(prompt: string): DirectSlashCommandName | null {
  const match = /^\/([^\s/]+)$/.exec(prompt.trim())
  if (!match || !DIRECT_SLASH_COMMANDS.has(match[1])) return null
  return match[1] as DirectSlashCommandName
}

// Hide these entries in the composer without disabling the underlying SDK capabilities.
const HIDDEN_COMMANDS = new Set([
  '__remote-workflow',
  'advisor',
  'agents',
  'auto-mode-setup',
  'autocompact',
  'clear',
  'claude-api',
  'code-review:code-review',
  'color',
  'compact',
  'config',
  'context',
  'debug',
  'design',
  'design-consent',
  'design-revoke',
  'design-sync',
  'doctor',
  'effort',
  'fast',
  'fewer-permission-prompts',
  'heapdump',
  'import',
  'init',
  'insights',
  'list-agents',
  'mcp',
  'model',
  'reload-plugins',
  'reload-skills',
  'rename',
  'run',
  'run-skill-generator',
  'skill-doctor',
  'team-onboarding',
  'update-config',
  'usage',
  'workflow-authoring',
  'workflow-launch-exec',
])

export function prepareSlashCommands(commands: ClaudeSlashCommand[]) {
  const seenNames = new Set<string>()

  return commands.filter((command) => {
    const name = command.name.replace(/^\/+/, '')
    if (HIDDEN_COMMANDS.has(name) || seenNames.has(name)) return false
    seenNames.add(name)
    return true
  })
}

export function filterSlashCommands(commands: ClaudeSlashCommand[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return commands

  return commands
    .map((command, index) => {
      const name = command.name.toLowerCase()
      const matchIndex = name.indexOf(normalizedQuery)
      if (matchIndex < 0) return null

      return {
        command,
        index,
        score: matchIndex === 0 ? 0 : 1,
      }
    })
    .filter((item): item is { command: ClaudeSlashCommand; index: number; score: number } =>
      Boolean(item),
    )
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .map((item) => item.command)
}

function SlashCommandOption({
  active,
  command,
  onActive,
  onSelect,
  query,
  scrollActiveIntoView,
}: {
  active: boolean
  command: ClaudeSlashCommand
  onActive: () => void
  onSelect: () => void
  query: string
  scrollActiveIntoView: boolean
}) {
  const optionRef = useRef<HTMLButtonElement | null>(null)
  const title = commandTooltip(command)

  useEffect(() => {
    if (!active || !scrollActiveIntoView) return
    optionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active, scrollActiveIntoView])

  return (
    <button
      ref={optionRef}
      aria-selected={active}
      className={cn(
        'flex w-full flex-col items-stretch gap-1 rounded-md px-2 py-1.5 text-left text-sm leading-5 outline-none transition-colors',
        active ? 'bg-accent text-accent-foreground' : 'text-popover-foreground',
      )}
      role="option"
      title={title}
      type="button"
      onClick={onSelect}
      onMouseEnter={onActive}
    >
      <span className="min-w-0 truncate">{highlightedName(command.name, query)}</span>
      {command.description ? (
        <span className="min-w-0 truncate text-xs text-foreground-subtlest">
          {command.description}
        </span>
      ) : null}
    </button>
  )
}

export function SlashCommandMenu({
  activeIndex,
  availableCommandCount,
  commands,
  interactionScope,
  menuRef,
  onActiveIndexChange,
  onSelect,
  placement,
  position,
  query,
  scrollActiveIntoView,
}: {
  activeIndex: number
  availableCommandCount: number
  commands: ClaudeSlashCommand[]
  interactionScope?: string
  menuRef?: Ref<HTMLDivElement>
  onActiveIndexChange: (index: number) => void
  onSelect: (command: ClaudeSlashCommand) => void
  placement: SlashCommandMenuPlacement
  position: SlashCommandMenuPosition
  query: string
  scrollActiveIntoView: boolean
}) {
  const { t } = useTranslation()
  return createPortal(
    <div
      aria-label={t('workbench.completion.slashCommands')}
      className="fixed z-50 max-h-72 overflow-y-auto rounded-lg border border-border/70 bg-popover p-1 text-popover-foreground shadow-float"
      data-glass="true"
      ref={menuRef}
      role="listbox"
      style={{
        left: position.left,
        top: position.top,
        width: 'min(420px, calc(100vw - 24px))',
      }}
      data-placement={placement}
      data-message-edit-surface={interactionScope}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
    >
      {commands.length ? (
        commands.map((command, index) => {
          const active = index === activeIndex

          return (
            <SlashCommandOption
              key={command.name}
              active={active}
              command={command}
              query={query}
              scrollActiveIntoView={scrollActiveIntoView}
              onActive={() => onActiveIndexChange(index)}
              onSelect={() => onSelect(command)}
            />
          )
        })
      ) : (
        <div className="px-2 py-1.5 text-sm text-foreground-subtlest" role="option" aria-disabled>
          {availableCommandCount
            ? t('workbench.completion.noCommandsMatch', { query })
            : t('workbench.completion.noCommands')}
        </div>
      )}
    </div>,
    document.body,
  )
}
