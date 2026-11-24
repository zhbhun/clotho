export const MIN_CLAUDE_VERSION = '2.1.0'
export const CLAUDE_INSTALL_GUIDE = 'https://code.claude.com/docs/en/quickstart'

export type ClaudeRuntimePhase =
  | 'checking'
  | 'missing'
  | 'outdated'
  | 'error'
  | 'ready'
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'failed'

export interface ClaudeRuntimeState {
  phase: ClaudeRuntimePhase
  minimumVersion: string
  path?: string
  customPath: string
  installPath: string
  version?: string
  source?: 'native' | 'other'
  operation?: 'install' | 'update'
  error?: string
  errorCode?: string
  logs: string
}
