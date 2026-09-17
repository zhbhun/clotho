import { useCallback } from 'react'

import { claude } from '../../../services/claude/claude'
import { getLogger } from '../../../services/logging'
import { materializeUnsavedDraft } from '../services/session-records'
import { workbenchSessionPersistence } from '../services/session-records'
import type { SessionControllerRegistry } from '../session/session-controller-registry'
import type { SessionError } from '../session/stores/runtime-store'
import { removeSessionPreferences } from '../session/stores/session-preferences'
import type { WorkbenchSession } from '../stores/workbench-store'
import { useWorkbenchStore } from '../stores/workbench-store'

const logger = getLogger('session')
const releaseNoop = () => Promise.resolve()

type SessionActionsOptions = {
  closeSession: (sessionId: string) => void
  onError: (sessionId: string, error: SessionError | null) => void
  refreshProjects: () => Promise<void>
  /** Stops the session's query and disposes its controller before deletion. */
  releaseSessionController?: (sessionId: string) => Promise<void>
  /** Live session controllers, used to snapshot a closing draft's composer. */
  controllerRegistry?: Pick<SessionControllerRegistry, 'find'>
  removeSession: (sessionId: string) => void
  selectSession: (sessionId: string) => void
  setSessionTitle: (sessionId: string, title: string) => void
  togglePinSession: (sessionId: string) => void
}

export function useSessionActions(options: SessionActionsOptions) {
  const {
    closeSession: closeSessionState,
    onError,
    refreshProjects,
    removeSession,
    selectSession,
    setSessionTitle,
    togglePinSession: togglePinSessionState,
  } = options
  const releaseSessionController = options.releaseSessionController ?? releaseNoop
  const forkSession = useCallback(
    async (session: WorkbenchSession, messageId: string) => {
      if (!session.claudeSessionId || !session.project_id) return
      onError(session.id, null)

      try {
        const result = await claude.forkSession({
          sessionId: session.claudeSessionId,
          projectId: session.project_id,
          messageId,
        })
        await refreshProjects()

        const forkedSession = Object.values(useWorkbenchStore.getState().sessions).find(
          (candidate) => candidate.claudeSessionId === result.sessionId,
        )
        if (!forkedSession) {
          throw new Error('Created branch was not found in the refreshed session list')
        }

        selectSession(forkedSession.id)
        if (forkedSession.project_id) {
          void claude.setProjectLastOpened(forkedSession.project_id)
        }
      } catch (caught) {
        onError(session.id, {
          kind: 'branch-create',
          message: caught instanceof Error ? caught.message : 'Failed to create session branch',
        })
      }
    },
    [onError, refreshProjects, selectSession],
  )

  const closeSession = useCallback(
    (session: WorkbenchSession) => {
      // An ephemeral draft with content becomes a stored draft when its tab
      // closes; an empty one disappears with the tab.
      if (session.isUnsavedDraft) {
        const composer = options.controllerRegistry?.find(session.id)?.composerService.snapshot()
        if (composer && (composer.prompt.trim() || composer.attachments?.length)) {
          void materializeUnsavedDraft(session.id, composer).catch((error: unknown) =>
            logger.error('session.draft_materialize_failed', 'Failed to save the draft session', {
              error,
            }),
          )
        }
      }
      closeSessionState(session.id)
    },
    [closeSessionState, options.controllerRegistry],
  )

  const renameSession = useCallback(
    async (sessionId: string, title: string) => {
      const nextTitle = title.trim()
      if (!nextTitle) throw new Error('Session title cannot be empty')
      const session = useWorkbenchStore.getState().sessions[sessionId]
      if (!session) throw new Error('Session not found')

      if (session.isDraft !== true) {
        if (!session.claudeSessionId || !session.project_id) {
          throw new Error('Session is not ready yet; try again later')
        }
        await claude.renameSession({
          projectId: session.project_id,
          sessionId: session.claudeSessionId,
          title: nextTitle,
        })
      }
      setSessionTitle(sessionId, nextTitle)
    },
    [setSessionTitle],
  )

  const deleteSession = useCallback(
    async (sessionId: string) => {
      const snapshot = useWorkbenchStore.getState()
      const session = snapshot.sessions[sessionId]
      if (!session) throw new Error('Session not found')

      try {
        // Stop the session's query and dispose its controller first, so an
        // in-flight stream or usage write cannot recreate the files after
        // the delete RPCs remove them.
        await releaseSessionController(sessionId)
        if (session.isDraft !== true) {
          if (!session.claudeSessionId) {
            // An unbound local draft only exists in local persistence.
            await removeSessionPreferences(sessionId)
            removeSession(sessionId)
            return
          }
          if (!session.project_id) {
            throw new Error('Session is not ready yet; try again later')
          }
          await claude.deleteSession({
            projectId: session.project_id,
            sessionId: session.claudeSessionId,
          })
        } else if (session.project_id) {
          // A cancelled first turn can leave a draft card bound to a Claude
          // session. The card's in-memory binding can be stale — a catalog
          // refresh rebuilds draft cards from the index, which does not record
          // it — so read the persisted record for the freshest value, then
          // fall back to the draft's own id (a fresh draft binds it as its
          // Claude session id). deleteSession is idempotent, so probing a
          // draft that never sent is a harmless no-op.
          const persisted = session.claudeSessionId
            ? undefined
            : await workbenchSessionPersistence.load(sessionId).catch(() => undefined)
          const boundSessionId = session.claudeSessionId ?? persisted?.claudeSessionId ?? sessionId
          await claude.deleteSession({
            projectId: session.project_id,
            sessionId: boundSessionId,
          })
        }
        await removeSessionPreferences(sessionId)
        removeSession(sessionId)
      } catch (caught) {
        logger.error('session.delete_failed', 'Failed to delete session', {
          context: {
            sessionId,
            claudeSessionId: session.claudeSessionId,
            projectId: session.project_id,
            isDraft: session.isDraft === true,
          },
          error: caught,
        })
        throw caught
      }
    },
    [releaseSessionController, removeSession],
  )

  const togglePinSession = useCallback(
    (session: WorkbenchSession) => togglePinSessionState(session.id),
    [togglePinSessionState],
  )

  return { closeSession, deleteSession, forkSession, renameSession, togglePinSession }
}
