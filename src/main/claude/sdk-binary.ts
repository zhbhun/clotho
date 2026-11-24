import { claudeRuntime } from './runtime'

/** Resolve the same verified user installation for SDK queries and plugin commands. */
export function resolveClaudeCodeBinary(): Promise<string> {
  return claudeRuntime.executable()
}
