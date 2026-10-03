import { AtSign, Folder, Hash, type LucideIcon, MessageSquareText } from 'lucide-react'

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
  icon: LucideIcon
  key: QuickOpenModeKey
  labelKey: string
  prefix: string
}

/** Mode entries listed by the default panel; picking one prefixes the query. */
export const QUICK_OPEN_MODE_ENTRIES: readonly QuickOpenModeEntry[] = [
  {
    icon: Folder,
    key: 'projects',
    labelKey: 'workbench.quick.mode.projects',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.projects,
  },
  {
    icon: Hash,
    key: 'allSessions',
    labelKey: 'workbench.quick.mode.allSessions',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.allSessions,
  },
  {
    icon: AtSign,
    key: 'projectSessions',
    labelKey: 'workbench.quick.mode.projectSessions',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.projectSessions,
  },
  {
    icon: MessageSquareText,
    key: 'sentMessages',
    labelKey: 'workbench.quick.mode.sentMessages',
    prefix: QUICK_OPEN_PREFIX_BY_MODE.sentMessages,
  },
]
