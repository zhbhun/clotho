import { useEffect, useState } from 'react'

import type { PublishedSkillBoard, PublishedSkillChart } from '@/shared/rpc'

import { getPublishedSkillBoard } from '../../../services/claude/agent-config'

export function useSkillRankings(view: PublishedSkillChart) {
  const [snapshot, setSnapshot] = useState<PublishedSkillBoard & { view: PublishedSkillChart }>()
  const [failed, setFailed] = useState<PublishedSkillChart>()
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    async function load() {
      const cached = await getPublishedSkillBoard(view, true)
      if (!active) return
      if (cached) setSnapshot({ view, ...cached })
      const current = await getPublishedSkillBoard(view, false)
      if (!active) return
      if (current) {
        setSnapshot({ view, ...current })
        setFailed(undefined)
      } else setFailed(view)
    }
    void load().catch(() => {
      if (active) setFailed(view)
    })
    return () => {
      active = false
    }
  }, [view, attempt])

  return {
    snapshot: snapshot?.view === view ? snapshot : undefined,
    failed: failed === view,
    retry() {
      setFailed(undefined)
      setAttempt((n) => n + 1)
    },
  }
}
