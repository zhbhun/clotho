import { describe, expect, it } from 'vitest'

import type { WorkbenchSession } from '../stores/workbench-store'
import type { SessionTimelineGroup } from '../utils/session-list'
import { createVirtualRows } from './virtual-rows'

function buildTimeline(groupSizes: number[]): SessionTimelineGroup[] {
  return groupSizes.map((size, groupIndex) => ({
    id: `group-${groupIndex}`,
    label: `Group ${groupIndex}`,
    sessions: Array.from({ length: size }, (_, sessionIndex) => ({
      isPinned: false,
      projectLabel: 'Project',
      session: { id: `session-${groupIndex}-${sessionIndex}` } as WorkbenchSession,
    })),
  }))
}

describe('createVirtualRows', () => {
  it('lays out rows at fixed offsets with groups spanning their sessions', () => {
    const { groupRows, rows, sessionIndexes } = createVirtualRows(buildTimeline([2, 3, 3]))

    expect(rows).toHaveLength(3 + 2 + 3 + 3)
    expect(rows[0]).toMatchObject({ label: 'Group 0', type: 'group' })
    expect(rows[3]).toMatchObject({ label: 'Group 1', type: 'group' })
    expect(rows[7]).toMatchObject({ label: 'Group 2', type: 'group' })
    expect(sessionIndexes.get('session-1-0')).toBe(4)
    // Group 0: 32px header + 2 sessions at 50px; later groups add an 8px top gap.
    expect(groupRows.map((row) => [row.start, row.end, row.hasTopGap])).toEqual([
      [0, 132, false],
      [132, 322, true],
      [322, 512, true],
    ])
  })
})
