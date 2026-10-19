import type { TFunction } from 'i18next'

import { projectDisplayName, projectNameFromPath } from '../../../utils/project'
import type { SessionActivity, WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'

export type SessionListEntry = {
  activity?: SessionActivity
  isPinned: boolean
  session: WorkbenchSession
  project?: WorkbenchProject
}

export type BuildSessionTimelineOptions = {
  hiddenProjectIds?: ReadonlySet<string>
  pinnedSessionIds?: ReadonlySet<string>
  projects: Record<string, WorkbenchProject>
  sessionActivity: Record<string, SessionActivity>
  sessions: Record<string, WorkbenchSession>
}

export type SessionTimelineGroup = {
  id: string
  label: string
  sessions: (SessionListEntry & { projectLabel: string })[]
}

/**
 * Synthetic trailing group of buildSessionTimeline holding archived sessions
 * when the caller opts in; the list renders it collapsed behind its header.
 */
export const ARCHIVED_GROUP_ID = 'archived'

export type WorkbenchTranslator = TFunction

/**
 * Canonical stored title for a session the user has not named yet. Display it
 * through sessionDisplayTitle so it renders in the active locale; compare
 * against this constant instead of repeating the literal.
 */
export const DEFAULT_SESSION_TITLE = 'New Chat'

const DEFAULT_TRANSLATOR = ((key: string) =>
  ({
    'workbench.session.new': 'New Chat',
    'workbench.session.archived': 'Archived chats',
    'workbench.session.pinned': 'Pinned',
    'workbench.session.today': 'Today',
    'workbench.session.twoDaysAgo': 'Two days ago',
    'workbench.session.yesterday': 'Yesterday',
  })[key] ?? key) as WorkbenchTranslator

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function calendarDayDistance(left: Date, right: Date) {
  const leftUtc = Date.UTC(left.getFullYear(), left.getMonth(), left.getDate())
  const rightUtc = Date.UTC(right.getFullYear(), right.getMonth(), right.getDate())
  return Math.round((leftUtc - rightUtc) / (24 * 60 * 60 * 1000))
}

export function sessionTitle(session: Pick<WorkbenchSession, 'id' | 'title'>) {
  return session.title?.trim() || `Session ${session.id.slice(0, 8)}`
}

/** sessionTitle for display: the untouched default title is localized. */
export function sessionDisplayTitle(
  session: Pick<WorkbenchSession, 'id' | 'title'>,
  t: WorkbenchTranslator = DEFAULT_TRANSLATOR,
) {
  return session.title === DEFAULT_SESSION_TITLE
    ? t('workbench.session.new')
    : sessionTitle(session)
}

export function sessionTimeLabel(
  seconds: number,
  now: Date,
  t: WorkbenchTranslator,
  locale: string,
) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''

  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return ''

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return t('workbench.history.justNow')
  if (elapsedSeconds < 60 * 60) {
    return t('workbench.history.minutesAgo', { count: Math.floor(elapsedSeconds / 60) })
  }

  const dateLabel = sessionDateLabel(seconds, now, t, locale)
  if (dateLabel !== t('workbench.session.today')) return dateLabel

  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).format(date)
}

export function sessionDateLabel(
  seconds: number,
  now = new Date(),
  t: WorkbenchTranslator = DEFAULT_TRANSLATOR,
  locale = 'zh-CN',
) {
  const date = new Date(seconds * 1000)
  const dayDistance = calendarDayDistance(startOfLocalDay(now), startOfLocalDay(date))
  if (dayDistance === 0) return t('workbench.session.today')
  if (dayDistance === 1) return t('workbench.session.yesterday')
  if (dayDistance === 2) return t('workbench.session.twoDaysAgo')

  const startOfWeek = startOfLocalDay(now)
  const mondayOffset = (startOfWeek.getDay() + 6) % 7
  startOfWeek.setDate(startOfWeek.getDate() - mondayOffset)
  if (date >= startOfWeek) {
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date)
  }

  if (date.getFullYear() === now.getFullYear()) {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(date)
  }

  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(
    date,
  )
}

function sessionDateId(seconds: number) {
  const date = new Date(seconds * 1000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Session subset shown by the sidebar's "current" tab: every session open in a
 * workspace tab plus the pinned ones (which stay reachable even when closed).
 */
export function pickOpenOrPinnedSessions({
  openSessionIds,
  pinnedSessionIds,
  sessions,
}: {
  openSessionIds: Iterable<string>
  pinnedSessionIds: ReadonlySet<string>
  sessions: Record<string, WorkbenchSession>
}): Record<string, WorkbenchSession> {
  const openIds = openSessionIds instanceof Set ? openSessionIds : new Set(openSessionIds)
  return Object.fromEntries(
    Object.entries(sessions).filter(([id]) => openIds.has(id) || pinnedSessionIds.has(id)),
  )
}

export function buildSessionTimeline({
  archivedGroup = false,
  hiddenProjectIds,
  now = new Date(),
  pinnedSessionIds,
  projects,
  sessionActivity,
  sessions,
  t: providedT,
  locale,
}: BuildSessionTimelineOptions & {
  archivedGroup?: boolean
  locale?: string
  now?: Date
  t?: WorkbenchTranslator
}) {
  const t = providedT ?? DEFAULT_TRANSLATOR
  const groups: SessionTimelineGroup[] = []
  const groupsById = new Map<string, SessionTimelineGroup>()
  const pinnedGroup: SessionTimelineGroup = {
    id: 'pinned',
    label: t('workbench.session.pinned'),
    sessions: [],
  }
  const archived: SessionTimelineGroup = {
    id: ARCHIVED_GROUP_ID,
    label: t('workbench.session.archived'),
    sessions: [],
  }
  const orderedSessions = Object.values(sessions).toSorted(compareSessions)

  for (const session of orderedSessions) {
    if (session.project_id && hiddenProjectIds?.has(session.project_id)) continue
    // A blank unsaved draft only exists as the open tab; it joins the history
    // list once it gains content and is materialized.
    if (session.isUnsavedDraft) continue

    // History keeps archived sessions out of the date groups; the "current"
    // tab (archivedGroup off) still shows them while their tab is open.
    if (archivedGroup && session.archived) {
      const project = session.project_id ? projects[session.project_id] : undefined
      archived.sessions.push({
        activity: sessionActivity[session.id] ?? 'idle',
        isPinned: false,
        project,
        projectLabel: project
          ? projectDisplayName(project)
          : projectNameFromPath(session.project_path) || session.project_id,
        session,
      })
      continue
    }

    let group = pinnedSessionIds?.has(session.id) ? pinnedGroup : undefined
    if (!group) {
      const id = sessionDateId(session.created_at)
      group = groupsById.get(id)
      if (!group) {
        group = { id, label: sessionDateLabel(session.created_at, now, t, locale), sessions: [] }
        groupsById.set(id, group)
        groups.push(group)
      }
    }

    const project = session.project_id ? projects[session.project_id] : undefined
    group.sessions.push({
      activity: sessionActivity[session.id] ?? 'idle',
      isPinned: Boolean(pinnedSessionIds?.has(session.id)),
      project,
      projectLabel: project
        ? projectDisplayName(project)
        : projectNameFromPath(session.project_path) || session.project_id,
      session,
    })
  }

  const datedGroups = pinnedGroup.sessions.length ? [pinnedGroup, ...groups] : groups
  return archived.sessions.length ? [...datedGroups, archived] : datedGroups
}

export function compareSessions(left: WorkbenchSession, right: WorkbenchSession) {
  return (
    (right.updated_at ?? right.created_at) - (left.updated_at ?? left.created_at) ||
    left.id.localeCompare(right.id)
  )
}

export type AutoArchiveCandidatesOptions = {
  currentSessionId: string | null
  /** Inactivity threshold in whole days; 0 disables the sweep. */
  days: number
  now?: Date
  openSessionIds: Iterable<string>
  pinnedSessionIds: ReadonlySet<string>
  sessionActivity: Record<string, SessionActivity>
  sessions: Record<string, WorkbenchSession>
}

/**
 * Sessions idle long enough to archive automatically. Activity counts from the
 * last transcript write, and a recent manual unarchive grants one full grace
 * period before the session can be swept again. Anything in use — open in a
 * tab, selected, pinned, running, awaiting input, or unread — never sweeps.
 */
export function pickAutoArchiveCandidates({
  currentSessionId,
  days,
  now = new Date(),
  openSessionIds,
  pinnedSessionIds,
  sessionActivity,
  sessions,
}: AutoArchiveCandidatesOptions): WorkbenchSession[] {
  if (days <= 0) return []
  const cutoffSeconds = Math.floor((now.getTime() - days * 24 * 60 * 60 * 1000) / 1000)
  const openIds = openSessionIds instanceof Set ? openSessionIds : new Set(openSessionIds)
  return Object.values(sessions).filter((session) => {
    if (session.archived) return false
    if (session.isDraft || session.isUnsavedDraft) return false
    if (session.id === currentSessionId) return false
    if (openIds.has(session.id)) return false
    if (pinnedSessionIds.has(session.id)) return false
    if ((sessionActivity[session.id] ?? 'idle') !== 'idle') return false
    const lastActivitySeconds = Math.max(
      session.updated_at ?? session.created_at ?? 0,
      session.unarchived_at ?? 0,
    )
    return lastActivitySeconds > 0 && lastActivitySeconds < cutoffSeconds
  })
}
