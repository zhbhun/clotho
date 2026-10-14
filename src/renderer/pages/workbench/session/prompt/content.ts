import type { JSONContent } from '@tiptap/core'

import { fileReferenceFromPath } from './files'

function textNode(text: string): JSONContent | null {
  return text ? { type: 'text', text } : null
}

// Trailing sentence punctuation stays out of a restored command chip; it
// resumes as text right after it, so the serialized prompt is unchanged.
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?)\]}，。；：！？）」』]+$/u

// A chip takes punctuation directly (`/review,`) the way a word does, without
// the boundary space.
const CHIP_PUNCTUATION_PATTERN = /^[.,;:!?)\]}，。；：！？）」』]/u

const CHIP_NODE_TYPES = new Set(['fileMention', 'slashCommand'])

function slashCommandNode(name: string): JSONContent {
  return { type: 'slashCommand', attrs: { name } }
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

function lineNodes(line: string, chipSlashCommands = false) {
  if (!line || !chipSlashCommands) {
    const node = textNode(line)
    return node ? [node] : []
  }

  // Restored drafts turn every word-start slash token into a command chip
  // without consulting the command list: the composer must not wait for
  // session startup to show the reference blocks, and the token serializes
  // back identically either way.
  const content: JSONContent[] = []
  const commandPattern = /\/[^\s/]+/g
  let textStart = 0
  let lastWasChip = false

  for (const match of line.matchAll(commandPattern)) {
    const index = match.index
    if (index > 0 && !/\s/.test(line[index - 1] ?? '')) continue
    const name = match[0].slice(1).replace(TRAILING_PUNCTUATION_PATTERN, '')
    if (!name) continue

    const before = textNode(stripBoundarySpace(line.slice(textStart, index), lastWasChip))
    if (before) content.push(before)
    content.push(slashCommandNode(name))
    textStart = index + 1 + name.length
    lastWasChip = true
  }

  const after = textNode(stripBoundarySpace(line.slice(textStart), lastWasChip))
  return after ? [...content, after] : content
}

// A chip's surrounding spaces live in its padding, not as text: drop the one
// space the serializer writes on each side of a chip so the restored document
// does not show both.
function stripBoundarySpace(text: string, afterChip: boolean) {
  if (afterChip) return text.startsWith(' ') ? text.slice(1) : text
  return text.endsWith(' ') ? text.slice(0, -1) : text
}

export function markdownTextToDoc(value: string | null | undefined): JSONContent {
  const content: JSONContent[] = []
  const lines = (typeof value === 'string' ? value : '').split('\n')

  lines.forEach((line, index) => {
    content.push(...lineNodesWithMentions(line, true))
    if (index < lines.length - 1) content.push({ type: 'hardBreak' })
  })

  return {
    type: 'doc',
    content: [{ type: 'paragraph', content }],
  }
}

function lineNodesWithMentions(
  line: string,
  chipSlashCommands: boolean,
  referenceFilter?: (path: string) => boolean,
) {
  // Reconstruct file chips from their markdown form. Simple paths stay @path;
  // quoted JSON strings preserve every character in less common paths.
  const parts: JSONContent[] = []
  const pattern = /@"(?:\\.|[^"\\])*"|@([^\s@]+)/g
  let start = 0
  let lastWasChip = false
  for (const match of line.matchAll(pattern)) {
    const index = match.index
    if (index > 0 && !/[\s([{]/.test(line[index - 1] ?? '')) continue
    const path = parsedFileMention(match[0])
    if (path === null) continue
    const { filePath, lineHint } = splitLineHint(path)
    if (referenceFilter && !referenceFilter(filePath)) continue
    parts.push(
      ...lineNodes(stripBoundarySpace(line.slice(start, index), lastWasChip), chipSlashCommands),
    )
    parts.push({
      type: 'fileMention',
      attrs: { ...fileReferenceFromPath(filePath), lineHint },
    })
    start = index + match[0].length
    lastWasChip = true
  }
  parts.push(...lineNodes(stripBoundarySpace(line.slice(start), lastWasChip), chipSlashCommands))
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

  return serializeInline(node.content ?? [])
}

// Chips always own a space on each side — the editor renders it as the chip's
// padding — so a chip typed flush against text still serializes with the
// boundaries the restore parser requires.
function serializeInline(nodes: JSONContent[]): string {
  let out = ''
  let prevIsChip = false
  for (const node of nodes) {
    const text = serializeNode(node)
    if (!text) continue
    const isChip = CHIP_NODE_TYPES.has(node.type ?? '')
    if ((prevIsChip || isChip) && needsBoundarySpace(out, text)) out += ' '
    out += text
    prevIsChip = isChip
  }
  return out
}

function needsBoundarySpace(out: string, text: string) {
  const last = out.at(-1)
  const first = text[0]
  return Boolean(
    last && first && !/\s/.test(last) && !/\s/.test(first) && !CHIP_PUNCTUATION_PATTERN.test(first),
  )
}

export function promptDocToMarkdown(doc: JSONContent): string {
  const blocks = doc.type === 'doc' ? (doc.content ?? []) : [doc]
  return blocks.map(serializeNode).join('\n\n')
}

export function restorePromptDocument(value: string | null | undefined) {
  return markdownTextToDoc(value)
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
    nodes.push(...lineNodesWithMentions(line, false, looksLikeFilePath))
    if (index < lines.length - 1) nodes.push({ type: 'hardBreak' })
  })
  return nodes.some((node) => node.type === 'fileMention') ? nodes : null
}

export function hasPromptAtoms(doc: JSONContent): boolean {
  if (doc.type === 'fileMention' || doc.type === 'slashCommand') return true
  return (doc.content ?? []).some(hasPromptAtoms)
}
