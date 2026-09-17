import { isConfigurablePermissionMode } from '../../../../components/permission-mode'
import { loadDefaultPermissionMode } from '../../../../services/app-settings'
import type { ClaudePermissionMode } from '../../../../services/claude/claude'
import {
  type SessionComposer,
  type SessionPersistence,
  sessionPersistence,
} from '../../services/session-persistence'

export type SessionPreferences = SessionComposer

type SessionPreferenceContext = {
  claudeSessionId: string | null
  projectId: string | null
  projectPath: string | null
}

export function createDefaultPreferences(
  getDefaultPermissionMode: () => ClaudePermissionMode = loadDefaultPermissionMode,
): SessionPreferences {
  return {
    prompt: '',
    selectedProviderId: null,
    selectedModelId: null,
    selectedAgent: null,
    permissionMode: getDefaultPermissionMode(),
  }
}
export function sanitizeSessionPreferences(
  preferences: Partial<SessionPreferences> | null | undefined,
  fallbackPermissionMode: ClaudePermissionMode,
): SessionPreferences {
  return {
    prompt: preferences?.prompt ?? '',
    attachments: preferences?.attachments ?? [],
    selectedProviderId: preferences?.selectedProviderId ?? null,
    selectedModelId: preferences?.selectedModelId ?? null,
    selectedAgent: preferences?.selectedAgent ?? null,
    permissionMode: isConfigurablePermissionMode(preferences?.permissionMode)
      ? preferences.permissionMode
      : fallbackPermissionMode,
    ...(preferences?.recalledFromMessage
      ? { recalledFromMessage: preferences.recalledFromMessage }
      : {}),
  }
}
export function loadSessionPreferences(
  sessionId: string,
  persistence: SessionPersistence = sessionPersistence,
) {
  return sanitizeSessionPreferences(
    persistence.get(sessionId)?.composer,
    loadDefaultPermissionMode(),
  )
}
export function saveSessionPreferences(
  sessionId: string,
  preferences: SessionPreferences,
  persistence: SessionPersistence = sessionPersistence,
  context?: Partial<SessionPreferenceContext>,
) {
  return persistence.update(sessionId, (current) => ({
    // Preserve untouched fields (contextUsage, …) from the stored record.
    ...current,
    id: sessionId,
    // Identity fields come from the stored record when one exists; the
    // caller's context only seeds a brand-new record, so a stale in-memory
    // context (e.g. claudeSessionId still null before hydration) can never
    // overwrite fresher on-disk values.
    projectId: current?.projectId ?? context?.projectId ?? null,
    projectPath: current?.projectPath ?? context?.projectPath ?? null,
    claudeSessionId: current?.claudeSessionId ?? context?.claudeSessionId ?? null,
    composer: preferences,
  }))
}
export function removeSessionPreferences(
  sessionId: string,
  persistence: SessionPersistence = sessionPersistence,
) {
  return persistence.remove(sessionId)
}
