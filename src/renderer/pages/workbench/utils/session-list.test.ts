import { describe, expect, it } from 'vitest'

import type { WorkbenchProject, WorkbenchSession } from '../stores/workbench-store'
import {
  type WorkbenchTranslator,
  buildSessionTimeline,
  pickOpenOrPinnedSessions,
  sessionDateLabel,
} from './session-list'

const en = (key: string) =>
  ({
    'workbench.session.today': 'Today',
    'workbench.session.yesterday': 'Yesterday',
    'workbench.session.twoDaysAgo': 'Two days ago',
    'workbench.session.pinned': 'Pinned',
  })[key] ?? key

const zhCN = (key: string) =>
  ({
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
