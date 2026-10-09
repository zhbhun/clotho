import type { JSONContent } from '@tiptap/core'

import type { ClaudeSlashCommand } from '../../../../services/claude/claude'
import { fileReferenceFromPath } from './files'

function textNode(text: string): JSONContent | null {
  return text ? { type: 'text', text } : null
}

function normalizedCommandName(name: string) {
  return name.replace(/^\/+/, '')
}

function serializedFileMention(path: string) {
  // Keep ordinary paths readable. JSON quoting makes whitespace, quotes,
  // backslashes, and @ characters reversible without adding another field.
  return /^[^\s@"\\]+$/.test(path) ? `@${path}` : `@${JSON.stringify(path)}`
}

function parsedFileMention(token: string) {
  if (!token.startsWith('@"')) return token.slice(1)
  try {
    const path = JSON.parse(token.slice(1))
    return typeof path === 'string' ? path : null
  } catch {
    return null
  }
}

const LINE_HINT_PATTERN = /(?:[:#]L?\d+(?:[-:]\d+)*)+$/i

/** Split a trailing `#125` / `#L7-11` / `:12:3` line hint off a referenced path. */
function splitLineHint(path: string) {
  const match = path.match(LINE_HINT_PATTERN)
  if (!match) return { filePath: path, lineHint: '' }
  const filePath = path.slice(0, path.length - match[0].length)
  // A bare hint (`@#11`) is not a file reference; keep it inside the path.
  if (!filePath) return { filePath: path, lineHint: '' }
  return { filePath, lineHint: match[0] }
}

function looksLikeFilePath(path: string) {
  return /[\\/]/.test(path) || /\.[A-Za-z0-9]+$/.test(path)
}

function lineNodes(line: string, commands: ClaudeSlashCommand[]) {
  if (!line || commands.length === 0) {
    const node = textNode(line)
    return node ? [node] : []
  }

  const commandsByName = new Map(
    commands.map((command) => [normalizedCommandName(command.name), command]),
  )
  const content: JSONContent[] = []
  const commandPattern = /\/[^\s/]+/g
  let textStart = 0

  for (const match of line.matchAll(commandPattern)) {
    const index = match.index
    if (index > 0 && !/\s/.test(line[index - 1] ?? '')) continue
    const command = commandsByName.get(match[0].slice(1))
    if (!command) continue

    const before = textNode(line.slice(textStart, index))
    if (before) content.push(before)
    content.push({
      type: 'slashCommand',
      attrs: {
        aliases: command.aliases ?? [],
        argumentHint: command.argumentHint,
        description: command.description,
        name: normalizedCommandName(command.name),
      },
    })
    textStart = index + match[0].length
  }

  const after = textNode(line.slice(textStart))
  if (after) content.push(after)
  return content
}

export function markdownTextToDoc(
  value: string | null | undefined,
  commands: ClaudeSlashCommand[] = [],
): JSONContent {
  const content: JSONContent[] = []
  const lines = (typeof value === 'string' ? value : '').split('\n')

  lines.forEach((line, index) => {
    content.push(...lineNodesWithMentions(line, commands))
    if (index < lines.length - 1) content.push({ type: 'hardBreak' })
  })

  return {
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  }
}

function lineNodesWithMentions(
  line: string,
  commands: ClaudeSlashCommand[],
  referenceFilter?: (path: string) => boolean,
) {
  // Reconstruct file chips from their markdown form. Simple paths stay @path;
  // quoted JSON strings preserve every character in less common paths.
  const parts: JSONContent[] = []
  const pattern = /@"(?:\\.|[^"\\])*"|@([^\s@]+)/g
  let start = 0
  for (const match of line.matchAll(pattern)) {
    const index = match.index
    if (index > 0 && !/[\s([{]/.test(line[index - 1] ?? '')) continue
    const path = parsedFileMention(match[0])
    if (path === null) continue
    const { filePath, lineHint } = splitLineHint(path)
    if (referenceFilter && !referenceFilter(filePath)) continue
    const before = lineNodes(line.slice(start, index), commands)
    parts.push(...before)
    parts.push({
      type: 'fileMention',
      attrs: { ...fileReferenceFromPath(filePath), lineHint },
    })
    start = index + match[0].length
  }
  parts.push(...lineNodes(line.slice(start), commands))
  return parts
}

function serializeNode(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  if (node.type === 'fileMention') {
    const path = typeof node.attrs?.path === 'string' ? node.attrs.path : ''
    if (!path) return ''
    const lineHint = typeof node.attrs?.lineHint === 'string' ? node.attrs.lineHint : ''
    return serializedFileMention(path) + lineHint
  }
  if (node.type === 'slashCommand') {
    const name = typeof node.attrs?.name === 'string' ? node.attrs.name : ''
    return name ? `/${name}` : ''
  }

  return (node.content ?? []).map(serializeNode).join('')
}

export function promptDocToMarkdown(doc: JSONContent): string {
  const blocks = doc.type === 'doc' ? (doc.content ?? []) : [doc]
  return blocks.map(serializeNode).join('\n\n')
}

export function restorePromptDocument(
  value: string | null | undefined,
  commands: ClaudeSlashCommand[] = [],
) {
  return markdownTextToDoc(value, commands)
}

/**
 * Inline nodes for pasted prompt text, or null when the text references no
 * file-like path so the caller can keep the default paste behavior. Only
 * path-shaped `@` references (a separator or an extension) become chips, so
 * ordinary mentions like `@reviewer` survive pasting untouched.
 */
export function promptTextToInlineNodes(text: string): JSONContent[] | null {
  if (!text.includes('@')) return null
  const lines = text.split('\n')
  const nodes: JSONContent[] = []
  lines.forEach((line, index) => {
    nodes.push(...lineNodesWithMentions(line, [], looksLikeFilePath))
    if (index < lines.length - 1) nodes.push({ type: 'hardBreak' })
  })
  return nodes.some((node) => node.type === 'fileMention') ? nodes : null
}

export function hasPromptAtoms(doc: JSONContent): boolean {
  if (doc.type === 'fileMention' || doc.type === 'slashCommand') return true
  return (doc.content ?? []).some(hasPromptAtoms)
}
