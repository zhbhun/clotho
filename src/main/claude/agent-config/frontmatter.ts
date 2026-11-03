/**
 * Minimal markdown frontmatter reader shared by the agent-config modules:
 * extracts the `name` and `description` fields the lists and detail views need.
 */
export interface FrontmatterInfo {
  name?: string
  description?: string
}

export function readFrontmatter(source: string): FrontmatterInfo {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source)
  if (!match) return {}
  const fields: FrontmatterInfo = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim()
    if (key === 'name' && !fields.name) fields.name = value.replace(/^["']|["']$/g, '')
    // Multi-line descriptions start a block scalar; take the first line's payload.
    if (key === 'description' && value) {
      fields.description = value.replace(/^["']|["']$/g, '')
    } else if (key === 'description' && !value) {
      fields.description = ''
    }
  }
  return fields
}
