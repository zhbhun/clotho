import type { CommandId } from '@/shared/shortcuts'

export type QuickOpenModeKey = 'projects' | 'allSessions' | 'projectSessions' | 'sentMessages'

export type QuickOpenMode = QuickOpenModeKey | 'default'

export const QUICK_OPEN_PREFIX_BY_MODE: Record<QuickOpenModeKey, string> = {
  allSessions: '#',
  projectSessions: '@',
  projects: '~',
  sentMessages: ':',
}

const MODE_BY_PREFIX: Record<string, QuickOpenModeKey> = {
  '#': 'allSessions',
  '@': 'projectSessions',
  ':': 'sentMessages',
  '~': 'projects',
}

/** The first character of the quick-open query selects the panel mode; the
    remaining text is that mode's filter. */
export function parseQuickOpenQuery(query: string): { filter: string; mode: QuickOpenMode } {
  const mode = MODE_BY_PREFIX[query[0] ?? '']
  if (!mode) return { filter: query, mode: 'default' }
  return { filter: query.slice(1), mode }
}

export type QuickOpenModeEntry = {
  commandId?: CommandId
  key: QuickOpenModeKey
  labelKey: string
  prefix: string
}

/** Mode entries listed by the default panel; picking one prefixes the query.
    `commandId` names the command that opens the palette straight into this
    mode — its current binding becomes the row's trailing hint when set. */
export const QUICK_OPEN_MODE_ENTRIES: readonly QuickOpenModeEntry[] = [
  {
    commandId: 'workbench.picker.project.open',
    key: 'projects',
    labelKey: 'workbench.quick.mode.projects',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.projects,
  },
  {
    commandId: 'workbench.picker.allSessions.open',
    key: 'allSessions',
    labelKey: 'workbench.quick.mode.allSessions',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.allSessions,
  },
  {
    commandId: 'workbench.picker.session.open',
    key: 'projectSessions',
    labelKey: 'workbench.quick.mode.projectSessions',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.projectSessions,
  },
  {
    key: 'sentMessages',
    labelKey: 'workbench.quick.mode.sentMessages',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.sentMessages,
  },
]
