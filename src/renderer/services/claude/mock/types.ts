import type { ClaudeJsonLine, ClaudeSubagent } from '@/shared/rpc'

export interface MockSubagentDef {
  lines: () => ClaudeJsonLine[]
  listed?: boolean
  meta: ClaudeSubagent
}
