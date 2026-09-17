import type {
  ClaudeAttachment,
  ClaudeAttachmentReadResult,
  ClaudeContentPart,
  ClaudeLoadedAttachment,
} from '@/shared/rpc'

import { claude } from '../../../../services/claude/claude'

export type AttachmentUpdate =
  ClaudeAttachment[] | ((current: ClaudeAttachment[]) => ClaudeAttachment[])

/** Map a validated load to the content variant the composer persists in the session file. */
export function loadedToAttachment(loaded: ClaudeLoadedAttachment): ClaudeAttachment {
  return { name: loaded.name, content: loaded.content }
}

function attachmentSourcePath(attachment: ClaudeAttachment) {
  return attachment.content?.source.path ?? null
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('error', () => reject(reader.error))
    reader.addEventListener('load', () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const index = result.indexOf(',')
      resolve(index === -1 ? '' : result.slice(index + 1))
    })
    reader.readAsDataURL(file)
  })
}

/** Read picked files into validated content blocks; `sourcePath` records the origin. */
export function readPickedFiles(
  files: { name: string; sourcePath?: string }[],
): Promise<ClaudeAttachmentReadResult> {
  return claude.loadAttachments({ files })
}

/** Read pasted clipboard bytes into validated content blocks. */
export async function readPastedFiles(files: File[]): Promise<ClaudeAttachmentReadResult> {
  const payloads = await Promise.all(
    files.map(async (file) => ({
      name: file.name || 'clipboard',
      data: await fileToBase64(file),
    })),
  )
  return claude.loadAttachments({ files: payloads })
}

/** Append loaded attachments, skipping picked files already attached (matched by source path). */
export function appendLoadedAttachments(current: ClaudeAttachment[], added: ClaudeAttachment[]) {
  const paths = new Set(current.map(attachmentSourcePath))
  const next = [...current]
  for (const attachment of added) {
    const key = attachmentSourcePath(attachment)
    if (key && paths.has(key)) continue
    if (key) paths.add(key)
    next.push(attachment)
  }
  return next
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
