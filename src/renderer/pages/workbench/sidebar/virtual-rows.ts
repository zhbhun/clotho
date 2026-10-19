import { ARCHIVED_GROUP_ID, type SessionTimelineGroup } from '../utils/session-list'

export const GROUP_HEIGHT = 32
export const GROUP_GAP = 8
export const SESSION_HEIGHT = 50

export type VirtualGroupRow = {
  /** Full session count of the group, even while collapsed. */
  count: number
  /** Content offset where the group's last session ends. */
  end: number
  hasTopGap: boolean
  isArchivedGroup: boolean
  isCollapsed: boolean
  key: string
  label: string
  /** Content offset of the group header row. */
  start: number
  type: 'group'
}

export type VirtualSessionRow =
  | VirtualGroupRow
  | {
      entry: SessionTimelineGroup['sessions'][number]
      key: string
      type: 'session'
    }

export type VirtualRows = {
  groupRows: VirtualGroupRow[]
  rows: VirtualSessionRow[]
  sessionIndexes: Map<string, number>
}

export function createVirtualRows(
  sessionTimeline: SessionTimelineGroup[],
  options?: { collapsedGroupIds?: ReadonlySet<string> },
): VirtualRows {
  const collapsedGroupIds = options?.collapsedGroupIds
  const rows: VirtualSessionRow[] = []
  const groupRows: VirtualGroupRow[] = []
  const sessionIndexes = new Map<string, number>()
  let offset = 0

  sessionTimeline.forEach((group, groupIndex) => {
    const hasTopGap = groupIndex > 0
    const labelOffset = hasTopGap ? GROUP_GAP : 0
    const isCollapsed = collapsedGroupIds?.has(group.id) ?? false

    const groupRow: VirtualGroupRow = {
      count: group.sessions.length,
      end: 0,
      hasTopGap,
      isArchivedGroup: group.id === ARCHIVED_GROUP_ID,
      isCollapsed,
      key: `group:${group.id}`,
      label: group.label,
      start: offset,
      type: 'group',
    }
    groupRows.push(groupRow)
    rows.push(groupRow)
    offset += GROUP_HEIGHT + labelOffset

    if (isCollapsed) {
      groupRow.end = offset
      return
    }

    group.sessions.forEach((entry) => {
      sessionIndexes.set(entry.session.id, rows.length)
      rows.push({ entry, key: `session:${entry.session.id}`, type: 'session' })
      offset += SESSION_HEIGHT
    })

    groupRow.end = offset
  })

  return { groupRows, rows, sessionIndexes }
}
