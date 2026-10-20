import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/shadcn/toast'

import { loadArchiveInactiveSessions } from '../../../services/app-settings'
import { claude } from '../../../services/claude/claude'
import { getLogger } from '../../../services/logging'
import type { WorkbenchSession } from '../stores/workbench-store'
import { useWorkbenchStore } from '../stores/workbench-store'
import { pickAutoArchiveCandidates } from '../utils/session-list'

const logger = getLogger('session')
const SWEEP_INTERVAL_MS = 5 * 60 * 1000

function archivedPayloadOf(sessions: WorkbenchSession[]) {
  return sessions.flatMap((session) =>
    session.project_id && session.claudeSessionId
      ? [{ projectId: session.project_id, sessionId: session.claudeSessionId }]
      : [],
  )
}

/**
 * Auto-archive sweep: archives sessions inactive past the configured days,
 * skipping anything in use. Runs after every catalog replacement and on a
 * fixed interval; a setting of 0 days disables it.
 */
export function useArchiveSweep() {
  const { t } = useTranslation()
  const projects = useWorkbenchStore((state) => state.projects)

  const sweep = useCallback(async () => {
    const days = loadArchiveInactiveSessions()
    if (days <= 0) return

    const state = useWorkbenchStore.getState()
    const candidates = pickAutoArchiveCandidates({
      currentSessionId: state.currentSessionId,
      days,
      openSessionIds: Object.values(state.sessionTabsByWorkspace).flat(),
      pinnedSessionIds: new Set(state.pinnedSessionIds),
      sessionActivity: state.sessionActivity,
      sessions: state.sessions,
    })
    if (candidates.length === 0) return

    try {
      await claude.setSessionsArchived({
        sessions: archivedPayloadOf(candidates),
        archived: true,
      })
    } catch (caught) {
      logger.warning('session.auto_archive_failed', 'Failed to auto-archive sessions', {
        count: candidates.length,
        reason: caught instanceof Error ? caught.message : String(caught),
      })
      return
    }

    useWorkbenchStore.getState().setSessionsArchived(
      candidates.map((session) => session.id),
      true,
    )
    toast.add({
      id: 'workbench-sessions-auto-archived',
      title: t('workbench.toast.autoArchived', { count: candidates.length }),
      type: 'info',
      actionProps: {
        children: t('workbench.toast.undo'),
        onClick: () => {
          void claude
            .setSessionsArchived({ sessions: archivedPayloadOf(candidates), archived: false })
            .then(() =>
              useWorkbenchStore.getState().setSessionsArchived(
                candidates.map((session) => session.id),
                false,
              ),
            )
            .catch(() => undefined)
        },
      },
    })
  }, [t])

  useEffect(() => {
    void sweep()
  }, [projects, sweep])

  useEffect(() => {
    const timer = window.setInterval(() => void sweep(), SWEEP_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [sweep])
}
