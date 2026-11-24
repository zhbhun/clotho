import { useEffect, useState } from 'react'

import {
  PUBLISHED_SKILL_CHARTS,
  type PublishedSkillBoard,
  type PublishedSkillChart,
} from '@/shared/rpc'

import { getPublishedSkillBoard } from '../../services/claude/agent-config'

export function useSkillRankings() {
  const [snapshots, setSnapshots] = useState<
    Partial<Record<PublishedSkillChart, PublishedSkillBoard>>
  >({})
  const [failed, setFailed] = useState<Set<PublishedSkillChart>>(new Set())
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    // Boards load independently so a slow or unavailable chart cannot block the others.
    for (const chart of PUBLISHED_SKILL_CHARTS) {
      async function load() {
        const cached = await getPublishedSkillBoard(chart, true)
        if (!active) return
        if (cached) setSnapshots((current) => ({ ...current, [chart]: cached }))
        const current = await getPublishedSkillBoard(chart, false)
        if (!active) return
        if (current) setSnapshots((boards) => ({ ...boards, [chart]: current }))
        else setFailed((charts) => new Set(charts).add(chart))
      }
      void load().catch(() => {
        if (active) setFailed((charts) => new Set(charts).add(chart))
      })
    }
    return () => {
      active = false
    }
  }, [attempt])

  return {
    snapshots,
    failed,
    retry() {
      setFailed(new Set())
      setAttempt((n) => n + 1)
    },
  }
}
