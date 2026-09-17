import type { MessageKey } from '../../../i18n/resources'
import type { SessionErrorKind } from './stores/runtime-store'

const SESSION_ERROR_KEYS = {
  'branch-create': 'workbench.error.branchCreateFailed',
  'draft-close': 'workbench.error.draftCloseFailed',
  'message-edit': 'workbench.error.messageEditFailed',
  'message-send': 'workbench.error.messageSendFailed',
  'model-required': 'workbench.error.providerModelRequired',
  'session-cleanup': 'workbench.error.sessionCleanupFailed',
  'session-initialize': 'workbench.error.sessionInitializeFailed',
  'session-reload': 'workbench.error.sessionReloadFailed',
} as const satisfies Record<SessionErrorKind, MessageKey>

export function sessionErrorKey(kind: SessionErrorKind): MessageKey {
  return SESSION_ERROR_KEYS[kind]
}
