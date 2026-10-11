export function pickString(input: unknown, keys: string[]): string {
  if (!input || typeof input !== 'object') return ''
  const obj = input as Record<string, unknown>
  for (const key of keys) {
    const value = obj[key]
    if (typeof value === 'string' && value.trim()) return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

/** `mcp__server__tool_name` → `server:tool_name`; `__` is the separator. */
export function mcpToolName(name: string): string {
  return name.replace(/^mcp__/, '').replace(/__+/g, ':')
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
