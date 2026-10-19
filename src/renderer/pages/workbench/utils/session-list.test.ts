import { describe, expect, it } from 'vitest'

import type { WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'
import {
  ARCHIVED_GROUP_ID,
  type WorkbenchTranslator,
  buildSessionTimeline,
  pickAutoArchiveCandidates,
  pickOpenOrPinnedSessions,
  sessionDateLabel,
} from './session-list'

const en = (key: string) =>
  ({
    'workbench.session.archived': 'Archived chats',
    'workbench.session.today': 'Today',
    'workbench.session.yesterday': 'Yesterday',
    'workbench.session.twoDaysAgo': 'Two days ago',
    'workbench.session.pinned': 'Pinned',
  })[key] ?? key

const zhCN = (key: string) =>
  ({
    'workbench.session.archived': '已归档',
    'workbench.session.today': '今天',
    'workbench.session.yesterday': '昨天',
    'workbench.session.twoDaysAgo': '前天',
    'workbench.session.pinned': '置顶',
  })[key] ?? key

function at(year: number, month: number, day: number, hour = 12) {
  return Math.floor(new Date(year, month - 1, day, hour).getTime() / 1000)
}

function session(overrides: Partial<WorkbenchSession>): WorkbenchSession {
  return {
    id: 'session',
    claudeSessionId: null,
    project_id: '',
    project_path: '',
    created_at: 0,
    title: 'Session',
    ...overrides,
  }
}

function project(id: string, path = `/workspace/${id}`): WorkbenchProject {
  return { id, path, sessions: [], created_at: 0 }
}

describe('session timeline', () => {
  it('uses the supplied translator and locale instead of fixed Chinese labels', () => {
    const now = new Date(2026, 7, 7, 18)

    expect([
      sessionDateLabel(at(2026, 8, 7), now, en as WorkbenchTranslator, 'en'),
      sessionDateLabel(at(2026, 8, 6), now, en as WorkbenchTranslator, 'en'),
      sessionDateLabel(at(2026, 8, 5), now, en as WorkbenchTranslator, 'en'),
      sessionDateLabel(at(2026, 8, 4), now, en as WorkbenchTranslator, 'en'),
      sessionDateLabel(at(2026, 7, 31), now, en as WorkbenchTranslator, 'en'),
      sessionDateLabel(at(2025, 12, 31), now, en as WorkbenchTranslator, 'en'),
    ]).toEqual(['Today', 'Yesterday', 'Two days ago', 'Tuesday', 'July 31', 'December 31, 2025'])
  })

  it('uses the requested local-calendar labels across recent and yearly boundaries', () => {
    const now = new Date(2026, 7, 7, 18)

    expect([
      sessionDateLabel(at(2026, 8, 7), now, zhCN as WorkbenchTranslator, 'zh-CN'),
      sessionDateLabel(at(2026, 8, 6), now, zhCN as WorkbenchTranslator, 'zh-CN'),
      sessionDateLabel(at(2026, 8, 5), now, zhCN as WorkbenchTranslator, 'zh-CN'),
      sessionDateLabel(at(2026, 8, 4), now, zhCN as WorkbenchTranslator, 'zh-CN'),
      sessionDateLabel(at(2026, 7, 31), now, zhCN as WorkbenchTranslator, 'zh-CN'),
      sessionDateLabel(at(2025, 12, 31), now, zhCN as WorkbenchTranslator, 'zh-CN'),
    ]).toEqual(['今天', '昨天', '前天', '星期二', '7月31日', '2025年12月31日'])
  })

  it('groups every session newest-first without separating opened sessions or projects', () => {
    const alpha = project('alpha', '/workspace/client/alpha')
    const sessions = {
      today: session({
        id: 'today',
        project_id: alpha.id,
        project_path: alpha.path,
        created_at: at(2026, 8, 7, 15),
      }),
      newerYesterday: session({ id: 'newer-yesterday', created_at: at(2026, 8, 6, 16) }),
      olderYesterday: session({ id: 'older-yesterday', created_at: at(2026, 8, 6, 9) }),
    }

    const result = buildSessionTimeline({
      now: new Date(2026, 7, 7, 18),
      locale: 'zh-CN',
      projects: { alpha },
      sessionActivity: { today: 'processing' },
      sessions,
      t: zhCN as WorkbenchTranslator,
    })

    expect(result.map((group) => group.label)).toEqual(['今天', '昨天'])
    expect(result.flatMap((group) => group.sessions.map((entry) => entry.session.id))).toEqual([
      'today',
      'newer-yesterday',
      'older-yesterday',
    ])
    expect(result[0]?.sessions[0]).toMatchObject({ projectLabel: 'alpha' })
    // A session without a project resolves its label from the path; the
    // built-in work project normally supplies both.
    expect(result[1]?.sessions[0]).toMatchObject({ projectLabel: '' })
  })

  it('moves pinned sessions into a leading pinned group without duplicating them', () => {
    const sessions = {
      newest: session({ id: 'newest', created_at: at(2026, 8, 7, 16) }),
      pinned: session({ id: 'pinned', created_at: at(2026, 8, 6, 15) }),
      oldestPinned: session({ id: 'oldest-pinned', created_at: at(2026, 8, 5, 14) }),
    }

    const result = buildSessionTimeline({
      now: new Date(2026, 7, 7, 18),
      locale: 'zh-CN',
      pinnedSessionIds: new Set(['pinned', 'oldest-pinned']),
      projects: {},
      sessionActivity: {},
      sessions,
      t: zhCN as WorkbenchTranslator,
    })

    expect(result.map((group) => group.label)).toEqual(['置顶', '今天'])
    expect(result[0]?.sessions.map((entry) => entry.session.id)).toEqual([
      'pinned',
      'oldest-pinned',
    ])
    expect(result.flatMap((group) => group.sessions.map((entry) => entry.session.id))).toEqual([
      'pinned',
      'oldest-pinned',
      'newest',
    ])
  })

  it('uses the session path for an orphaned project label', () => {
    const orphan = session({
      id: 'orphan',
      project_id: 'missing',
      project_path: '/workspace/archive/claudesk',
      created_at: at(2026, 8, 7),
    })

    const result = buildSessionTimeline({
      now: new Date(2026, 7, 7, 18),
      locale: 'zh-CN',
      projects: {},
      sessionActivity: {},
      sessions: { orphan },
      t: zhCN as WorkbenchTranslator,
    })

    expect(result[0]?.sessions[0]?.projectLabel).toBe('claudesk')
  })

  it('omits sessions belonging to projects hidden from the timeline', () => {
    const visibleProject = project('visible')
    const hiddenProject = project('mock')
    const result = buildSessionTimeline({
      hiddenProjectIds: new Set(['mock']),
      now: new Date(2026, 7, 7, 18),
      locale: 'zh-CN',
      projects: { mock: hiddenProject, visible: visibleProject },
      sessionActivity: {},
      sessions: {
        hidden: session({
          id: 'hidden',
          project_id: hiddenProject.id,
          created_at: at(2026, 8, 7, 16),
        }),
        visible: session({
          id: 'visible',
          project_id: visibleProject.id,
          created_at: at(2026, 8, 7, 15),
        }),
      },
      t: zhCN as WorkbenchTranslator,
    })

    expect(result.flatMap((group) => group.sessions.map((entry) => entry.session.id))).toEqual([
      'visible',
    ])
  })

  it('collects archived sessions into a trailing collapsed group for the history list', () => {
    const sessions = {
      fresh: session({ id: 'fresh', created_at: at(2026, 8, 7, 16) }),
      old: session({ id: 'old', created_at: at(2026, 8, 1, 9), archived: true }),
      archivedPinned: session({
        id: 'archived-pinned',
        created_at: at(2026, 8, 2, 9),
        archived: true,
      }),
    }

    const result = buildSessionTimeline({
      archivedGroup: true,
      now: new Date(2026, 7, 7, 18),
      pinnedSessionIds: new Set(['archived-pinned']),
      projects: {},
      sessionActivity: {},
      sessions,
      t: en as WorkbenchTranslator,
    })

    expect(result.map((group) => group.id)).toEqual(['2026-08-07', ARCHIVED_GROUP_ID])
    expect(result[1]?.label).toBe('Archived chats')
    expect(result[1]?.sessions.map((entry) => entry.session.id)).toEqual(['archived-pinned', 'old'])
    // Archived sessions never keep a pin slot; the archived group owns them.
    expect(result[1]?.sessions.every((entry) => !entry.isPinned)).toBe(true)
  })

  it('keeps archived sessions in their date groups when the archived group is off', () => {
    const archived = session({ id: 'archived', created_at: at(2026, 8, 7, 9), archived: true })

    const result = buildSessionTimeline({
      now: new Date(2026, 7, 7, 18),
      projects: {},
      sessionActivity: {},
      sessions: { archived },
      t: en as WorkbenchTranslator,
    })

    // The "current" tab shows a session while its tab is still open.
    expect(result.map((group) => group.id)).toEqual(['2026-08-07'])
    expect(result[0]?.sessions.map((entry) => entry.session.id)).toEqual(['archived'])
  })
})

describe('pickAutoArchiveCandidates', () => {
  const now = new Date(2026, 7, 7, 18)
  const quiet = (overrides: Partial<WorkbenchSession> = {}) =>
    session({ id: 'quiet', created_at: at(2026, 7, 20), updated_at: at(2026, 7, 20), ...overrides })

  it('archives idle sessions quiet past the threshold and honors the unarchive grace', () => {
    const sessions = {
      quiet: quiet(),
      recentlyUpdated: quiet({ id: 'recent', updated_at: at(2026, 8, 1) }),
      recentlyUnarchived: quiet({
        id: 'graced',
        unarchived_at: at(2026, 8, 6),
      }),
      staleUnarchived: quiet({
        id: 'stale-grace',
        unarchived_at: at(2026, 7, 21),
      }),
    }

    const result = pickAutoArchiveCandidates({
      currentSessionId: null,
      days: 7,
      now,
      openSessionIds: [],
      pinnedSessionIds: new Set(),
      sessionActivity: {},
      sessions,
    })

    // The grace window restarts the clock from the manual unarchive, so the
    // graced session is safe while the one whose grace expired sweeps again.
    expect(result.map((candidate) => candidate.id)).toEqual(['quiet', 'stale-grace'])
  })

  it('sweeps nothing when disabled, and skips archived, draft, timestampless, or in-use sessions', () => {
    const sessions = {
      quiet: quiet(),
      archived: quiet({ id: 'archived', archived: true }),
      draft: quiet({ id: 'draft', isDraft: true }),
      noTimestamp: session({ id: 'no-timestamp' }),
      current: quiet({ id: 'current' }),
      open: quiet({ id: 'open' }),
      pinned: quiet({ id: 'pinned' }),
      processing: quiet({ id: 'processing' }),
      awaiting: quiet({ id: 'awaiting' }),
      unread: quiet({ id: 'unread' }),
    }
    const sweep = (
      options: {
        currentSessionId?: string
        days?: number
        openSessionIds?: string[]
        pinned?: string[]
      } = {},
    ) =>
      pickAutoArchiveCandidates({
        currentSessionId: options.currentSessionId ?? null,
        days: options.days ?? 7,
        now,
        openSessionIds: options.openSessionIds ?? [],
        pinnedSessionIds: new Set(options.pinned ?? []),
        sessionActivity: {
          processing: 'processing',
          awaiting: 'awaiting-user',
          unread: 'unread-success',
        },
        sessions,
      })

    expect(sweep({ days: 0 })).toEqual([])
    // Archived, draft, timestampless, and active-activity sessions never sweep;
    // open/current/pinned ones do until their exclusion is passed in.
    expect(sweep().map((candidate) => candidate.id)).toEqual(['quiet', 'current', 'open', 'pinned'])
    expect(
      sweep({ currentSessionId: 'current', openSessionIds: ['open'], pinned: ['pinned'] }).map(
        (candidate) => candidate.id,
      ),
    ).toEqual(['quiet'])
  })
})

describe('pickOpenOrPinnedSessions', () => {
  it('keeps sessions that are open in any workspace tab or pinned, and drops the rest', () => {
    const result = pickOpenOrPinnedSessions({
      openSessionIds: ['open-in-other-project', 'open-here'],
      pinnedSessionIds: new Set(['pinned-closed']),
      sessions: {
        'open-here': session({ id: 'open-here' }),
        'open-in-other-project': session({ id: 'open-in-other-project' }),
        'pinned-closed': session({ id: 'pinned-closed' }),
        background: session({ id: 'background' }),
      },
    })

    expect(Object.keys(result).toSorted()).toEqual([
      'open-here',
      'open-in-other-project',
      'pinned-closed',
    ])
  })

  it('feeds a timeline where pinned sessions still lead the current tab', () => {
    const workSessions = pickOpenOrPinnedSessions({
      openSessionIds: ['opened'],
      pinnedSessionIds: new Set(['pinned']),
      sessions: {
        opened: session({ id: 'opened', created_at: at(2026, 8, 7, 16) }),
        pinned: session({ id: 'pinned', created_at: at(2026, 8, 7, 15) }),
      },
    })
    const result = buildSessionTimeline({
      now: new Date(2026, 7, 7, 18),
      pinnedSessionIds: new Set(['pinned']),
      projects: {},
      sessionActivity: {},
      sessions: workSessions,
      t: zhCN as WorkbenchTranslator,
    })

    expect(result.map((group) => group.id)).toEqual(['pinned', '2026-08-07'])
    expect(result[0]?.sessions.map((entry) => entry.session.id)).toEqual(['pinned'])
    expect(result[1]?.sessions.map((entry) => entry.session.id)).toEqual(['opened'])
  })
})
