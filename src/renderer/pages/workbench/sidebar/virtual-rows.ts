import type { SessionTimelineGroup } from '../utils/session-list'

export const GROUP_HEIGHT = 32
export const GROUP_GAP = 8
export const SESSION_HEIGHT = 50

export type VirtualGroupRow = {
  /** Content offset where the group's last session ends. */
  end: number
  hasTopGap: boolean
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

export function createVirtualRows(sessionTimeline: SessionTimelineGroup[]): VirtualRows {
  const rows: VirtualSessionRow[] = []
  const groupRows: VirtualGroupRow[] = []
  const sessionIndexes = new Map<string, number>()
  let offset = 0

  sessionTimeline.forEach((group, groupIndex) => {
    const hasTopGap = groupIndex > 0
    const labelOffset = hasTopGap ? GROUP_GAP : 0

    const groupRow: VirtualGroupRow = {
      end: 0,
      hasTopGap,
      key: `group:${group.id}`,
      label: group.label,
      start: offset,
      type: 'group',
    }
    groupRows.push(groupRow)
    rows.push(groupRow)
    offset += GROUP_HEIGHT + labelOffset

    group.sessions.forEach((entry) => {
      sessionIndexes.set(entry.session.id, rows.length)
      rows.push({ entry, key: `session:${entry.session.id}`, type: 'session' })
      offset += SESSION_HEIGHT
    })

    groupRow.end = offset
  })

  return { groupRows, rows, sessionIndexes }
}
