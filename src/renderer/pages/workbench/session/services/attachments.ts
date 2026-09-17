import type { ClaudeAttachment, ClaudeContentPart } from '@/shared/rpc'

export type AttachmentUpdate =
  ClaudeAttachment[] | ((current: ClaudeAttachment[]) => ClaudeAttachment[])

export function appendFileAttachments(current: ClaudeAttachment[], paths: string[]) {
  const existing = new Set(current.map((attachment) => attachment.path))
  const added = paths.filter((path) => {
    if (existing.has(path)) return false
    existing.add(path)
    return true
  })
  return [
    ...current,
    ...added.map((path) => ({ path, name: path.split(/[\\/]/).filter(Boolean).at(-1) ?? path })),
  ]
}

export function attachmentFromPart(part: ClaudeContentPart): ClaudeAttachment | undefined {
  const source = part.source
  if (!source || typeof source.data !== 'string' || !source.data) return undefined
  if (
    part.type === 'image' &&
    source.type === 'base64' &&
    (source.media_type === 'image/png' ||
      source.media_type === 'image/jpeg' ||
      source.media_type === 'image/gif' ||
      source.media_type === 'image/webp')
  ) {
    return {
      name: `image.${source.media_type.split('/')[1]}`,
      content: {
        type: 'image',
        source: { type: 'base64', media_type: source.media_type, data: source.data },
      },
    }
  }
  if (part.type !== 'document') return undefined
  const name =
    part.title || (source.media_type === 'application/pdf' ? 'document.pdf' : 'document.txt')
  if (source.type === 'base64' && source.media_type === 'application/pdf') {
    return {
      name,
      content: {
        type: 'document',
        title: name,
        source: { type: 'base64', media_type: 'application/pdf', data: source.data },
      },
    }
  }
  if (source.type === 'text' && source.media_type === 'text/plain') {
    return {
      name,
      content: {
        type: 'document',
        title: name,
        source: { type: 'text', media_type: 'text/plain', data: source.data },
      },
    }
  }
  return undefined
}
