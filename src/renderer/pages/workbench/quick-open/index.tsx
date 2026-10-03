import { MessageCircleCode, MessageSquareText } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CommandSeparator } from '@/shadcn/command'

import { ProjectIcon } from '../../../components/project-icon'
import {
  compareProjectsByName,
  isUserProject,
  projectDisplayName,
  projectNameFromPath,
} from '../../../utils/project'
import { SessionStatus } from '../session-status'
import { PROJECT_PATH_MAX } from '../session/project-switcher'
import {
  SwitcherCommand,
  SwitcherCommandDialog,
  SwitcherCommandEmpty,
  SwitcherCommandGroup,
  SwitcherCommandInput,
  SwitcherCommandItem,
  SwitcherCommandList,
} from '../session/switcher-command'
import {
  type SessionActivity,
  type WorkbenchProject,
  type WorkbenchSession,
  useWorkbenchStore,
} from '../stores/workbench-store'
import { shortMiddlePath, tildePath } from '../utils/path-display'
import { sessionDisplayTitle, sessionTimeLabel } from '../utils/session-list'
import { scoreFuzzyMatch } from './fuzzy-match'
import {
  QUICK_OPEN_MODE_ENTRIES,
  type QuickOpenMode,
  type QuickOpenModeEntry,
  parseQuickOpenQuery,
} from './quick-open-mode'
import {
  MESSAGE_PREVIEW_LIMIT,
  useQuickOpenSentPrompts,
  useQuickOpenSessions,
} from './use-quick-open-items'

const PLACEHOLDER_BY_MODE: Record<QuickOpenMode, string> = {
  allSessions: 'workbench.quick.placeholder.allSessions',
  default: 'workbench.quick.placeholder.default',
  projectSessions: 'workbench.quick.placeholder.projectSessions',
  projects: 'workbench.quick.placeholder.projects',
  sentMessages: 'workbench.quick.placeholder.sentMessages',
}

/** Keep the base order for a blank filter; otherwise keep matches only,
    best score first (stable sort preserves the base order on ties). */
function rankByScore<T>(items: T[], filter: string, targetsOf: (item: T) => string[]): T[] {
  const query = filter.trim()
  if (!query) return items

  return items
    .map((item) => ({ item, score: scoreFuzzyMatch(query, ...targetsOf(item)) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .toSorted((left, right) => right.score - left.score)
    .map((entry) => entry.item)
}

function elidePreview(preview: string) {
  return preview.length > MESSAGE_PREVIEW_LIMIT
    ? `${preview.slice(0, MESSAGE_PREVIEW_LIMIT)}…`
    : preview
}

/** The globally mounted quick-open palette: the query's first character routes
    to a mode (`~` projects, `#` all sessions, `@` project sessions, `:`
    sent messages) and the rest filters that mode's rows. */
export function QuickOpenPanel({
  open,
  projects,
  sessionActivity = {},
  onOpenChange,
  onScrollToMessage,
  onSelectProject,
  onSelectSession,
}: {
  open: boolean
  projects: WorkbenchProject[]
  sessionActivity?: Record<string, SessionActivity>
  onOpenChange: (isOpen: boolean) => void
  onScrollToMessage: (messageId: string) => void
  onSelectProject: (projectId: string) => void
  onSelectSession: (session: WorkbenchSession) => void
}) {
  const { i18n, t } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const currentProjectId = useWorkbenchStore((state) => state.currentProjectId)
  const currentSessionId = useWorkbenchStore((state) => state.currentSessionId)
  const { allSessions, projectSessions, recentSessions } = useQuickOpenSessions()
  const sentPrompts = useQuickOpenSentPrompts(open)

  useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const enterMode = (entry: QuickOpenModeEntry) => {
    setQuery(entry.prefix)
    const input = inputRef.current
    if (!input) return
    input.focus()
    // The prefixed value lands after this handler; once it does, park the
    // caret right behind the prefix so typing continues the filter.
    requestAnimationFrame(() => {
      const end = input.value.length
      input.setSelectionRange(end, end)
    })
  }

  const { filter, mode } = parseQuickOpenQuery(query)
  const now = new Date()
  const userProjects = useMemo(
    () => projects.filter(isUserProject).toSorted(compareProjectsByName),
    [projects],
  )
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  )

  const sessionProjectLabel = (session: WorkbenchSession) => {
    const project = session.project_id ? projectById.get(session.project_id) : undefined
    return (
      (project ? projectDisplayName(project) : undefined) ??
      projectNameFromPath(session.project_path) ??
      session.project_id
    )
  }

  const renderSessionItem = (session: WorkbenchSession) => {
    const time = sessionTimeLabel(session.updated_at ?? session.created_at, now, t, locale)
    const activity = session.isDraft ? 'idle' : (sessionActivity[session.id] ?? 'idle')

    return (
      <SwitcherCommandItem
        key={session.id}
        description={
          time ? `${sessionProjectLabel(session)} · ${time}` : sessionProjectLabel(session)
        }
        iconElement={
          <SessionStatus
            activity={activity}
            icon={<MessageCircleCode className="size-4" strokeWidth={1.5} />}
          />
        }
        label={sessionDisplayTitle(session, t)}
        value={`session:${session.id}`}
        onSelect={() => {
          onOpenChange(false)
          window.setTimeout(() => onSelectSession(session), 0)
        }}
      />
    )
  }

  const renderProjectItem = (project: WorkbenchProject) => (
    <SwitcherCommandItem
      key={project.id}
      description={shortMiddlePath(tildePath(project.path), PROJECT_PATH_MAX)}
      iconElement={<ProjectIcon className="size-auto" plain icon={project.icon} size="default" />}
      label={projectDisplayName(project)}
      value={`project:${project.id}`}
      onSelect={() => {
        onOpenChange(false)
        onSelectProject(project.id)
      }}
    />
  )

  const renderPromptItem = (prompt: (typeof sentPrompts)[number]) => (
    <SwitcherCommandItem
      key={prompt.id}
      description={`#${prompt.position}`}
      icon={MessageSquareText}
      label={elidePreview(prompt.preview)}
      value={`message:${prompt.id}`}
      onSelect={() => {
        onOpenChange(false)
        onScrollToMessage(prompt.id)
      }}
    />
  )

  const rankedProjects = rankByScore(userProjects, filter, (project) => [
    projectDisplayName(project),
    project.path,
  ])

  let content: React.ReactNode
  if (mode === 'default') {
    if (!filter.trim()) {
      content = (
        <>
          <SwitcherCommandGroup>
            {QUICK_OPEN_MODE_ENTRIES.map((entry) => (
              <SwitcherCommandItem
                key={entry.key}
                icon={entry.icon}
                label={String(t(entry.labelKey as never))}
                trailing={<span className="font-mono">{entry.prefix}</span>}
                value={`mode:${entry.key}`}
                onSelect={() => enterMode(entry)}
              />
            ))}
          </SwitcherCommandGroup>
          <CommandSeparator className="my-2" />
          <SwitcherCommandGroup heading={String(t('workbench.quick.recent'))}>
            {recentSessions.map(renderSessionItem)}
          </SwitcherCommandGroup>
        </>
      )
    } else {
      const rankedAllSessions = rankByScore(allSessions, filter, (session) => [
        sessionDisplayTitle(session, t),
      ])
      const rankedPrompts = rankByScore(sentPrompts, filter, (prompt) => [prompt.preview])

      content = (
        <>
          <SwitcherCommandEmpty>{String(t('workbench.quick.emptySearch'))}</SwitcherCommandEmpty>
          {rankedProjects.length ? (
            <SwitcherCommandGroup heading={String(t('workbench.quick.groupProjects'))}>
              {rankedProjects.map(renderProjectItem)}
            </SwitcherCommandGroup>
          ) : null}
          {rankedAllSessions.length ? (
            <SwitcherCommandGroup heading={String(t('workbench.quick.groupSessions'))}>
              {rankedAllSessions.map(renderSessionItem)}
            </SwitcherCommandGroup>
          ) : null}
          {rankedPrompts.length ? (
            <SwitcherCommandGroup heading={String(t('workbench.quick.groupMessages'))}>
              {rankedPrompts.map(renderPromptItem)}
            </SwitcherCommandGroup>
          ) : null}
        </>
      )
    }
  } else if (mode === 'projects') {
    content = (
      <>
        <SwitcherCommandEmpty>{String(t('workbench.quick.emptyProjects'))}</SwitcherCommandEmpty>
        <SwitcherCommandGroup>{rankedProjects.map(renderProjectItem)}</SwitcherCommandGroup>
      </>
    )
  } else if (mode === 'sentMessages') {
    const rankedPrompts = rankByScore(sentPrompts, filter, (prompt) => [prompt.preview])

    content = (
      <>
        <SwitcherCommandEmpty>
          {filter.trim()
            ? String(t('workbench.quick.emptyMessages'))
            : String(t('workbench.quick.noMessages'))}
        </SwitcherCommandEmpty>
        <SwitcherCommandGroup>{rankedPrompts.map(renderPromptItem)}</SwitcherCommandGroup>
      </>
    )
  } else {
    const sessions = rankByScore(
      mode === 'projectSessions' ? projectSessions : allSessions,
      filter,
      (session) => [sessionDisplayTitle(session, t)],
    )

    content = (
      <>
        <SwitcherCommandEmpty>{String(t('workbench.quick.emptySessions'))}</SwitcherCommandEmpty>
        <SwitcherCommandGroup>{sessions.map(renderSessionItem)}</SwitcherCommandGroup>
      </>
    )
  }

  return (
    <SwitcherCommandDialog
      description={String(t('workbench.quick.description'))}
      open={open}
      title={String(t('workbench.quick.title'))}
      onOpenChange={onOpenChange}
    >
      <SwitcherCommand
        defaultValue={
          mode === 'projects'
            ? (currentProjectId && `project:${currentProjectId}`) || undefined
            : mode === 'allSessions' || mode === 'projectSessions'
              ? (currentSessionId && `session:${currentSessionId}`) || undefined
              : undefined
        }
        shouldFilter={false}
      >
        <SwitcherCommandInput
          hideSearchIcon
          placeholder={String(t(PLACEHOLDER_BY_MODE[mode] as never))}
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
        />
        <SwitcherCommandList>{content}</SwitcherCommandList>
      </SwitcherCommand>
    </SwitcherCommandDialog>
  )
}
