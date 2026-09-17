import { claude } from '../../../services/claude/claude'
import { getLogger } from '../../../services/logging'
import { draftTitleFromPrompt } from '../session/draft-title'
import { createDefaultPreferences } from '../session/stores/session-preferences'
import { type WorkbenchSession, useWorkbenchStore } from '../stores/workbench-store'
import { DEFAULT_SESSION_TITLE } from '../utils/session-list'
import type { SessionComposer } from './session-persistence'
import { sessionPersistence } from './session-persistence'

export function draftMetadata(session: WorkbenchSession) {
  return {
    title: session.title,
    createdAt: session.created_at * 1000,
    updatedAt: (session.updated_at ?? session.created_at) * 1000,
    projectId: session.project_id || null,
    projectPath: session.project_path || null,
  }
}

/**
 * Persist an ephemeral blank draft that gained content: derive a title from
 * the first input when the user has not named it, flip the in-memory flag,
 * then write the session file and the drafts index entry.
 */
export async function materializeUnsavedDraft(sessionId: string, composer: SessionComposer) {
  const store = useWorkbenchStore.getState()
  const session = store.sessions[sessionId]
  if (!session?.isDraft || !session.isUnsavedDraft) return
  if (!session.custom_title && session.title === DEFAULT_SESSION_TITLE) {
    const title = draftTitleFromPrompt(composer.prompt, composer.attachments ?? [])
    if (title) store.setSessionTitle(sessionId, title)
  }
  useWorkbenchStore.getState().markDraftSaved(sessionId)
  const saved = useWorkbenchStore.getState().sessions[sessionId]
  if (!saved) return
  await workbenchSessionPersistence.create(saved, composer)
}

/** Catalog changes only update the index; existing input files are loaded on demand. */
export const workbenchSessionPersistence = {
  start() {
    return useWorkbenchStore.subscribe((state, previous) => {
      for (const session of Object.values(state.sessions)) {
        const before = previous.sessions[session.id]
        if (session === before) continue
        let write: Promise<void> | undefined
        if (session.isDraft) {
          // An unsaved blank draft has no index entry yet; materialization
          // writes it explicitly.
          if (!session.isUnsavedDraft)
            write = claude.updateLocalDraft(session.id, draftMetadata(session))
        } else if (before?.isDraft) {
          write = claude.completeLocalDraft(session.id)
        }
        void write?.catch((error) =>
          getLogger('persistence').error(
            'session.index_write_failed',
            'Failed to save the session index',
            { error },
          ),
        )
      }
    })
  },
  async create(session: WorkbenchSession, composer?: SessionComposer) {
    await sessionPersistence.update(session.id, () => ({
      id: session.id,
      projectId: session.project_id || null,
      projectPath: session.project_path || null,
      claudeSessionId: null,
      composer: composer ?? createDefaultPreferences(),
    }))
    // Explicit creation is a deliberate user action: persist it immediately
    // instead of waiting for the coalesced flush.
    await sessionPersistence.flush()
    await claude.updateLocalDraft(session.id, draftMetadata(session))
  },
  remove: (sessionId: string) => sessionPersistence.remove(sessionId),
  load: (sessionId: string) => sessionPersistence.load(sessionId),
}
