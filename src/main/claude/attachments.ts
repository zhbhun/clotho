import { constants } from 'node:fs'
import { open } from 'node:fs/promises'

import type {
  ClaudeAttachment,
  ClaudeAttachmentContent,
  ClaudeAttachmentPreview,
  ClaudeAttachmentPreviewParams,
  ClaudeAttachmentReadParams,
  ClaudeAttachmentReadResult,
  ClaudeAttachmentRejectReason,
  ClaudeLoadedAttachment,
  ClaudePrepareAttachmentsParams,
  ClaudePreparedAttachments,
} from '@/shared/rpc'

const MIB = 1024 * 1024
export const MAX_TOTAL_BYTES = 20 * MIB
// Deliberately generous: the SDK resamples and compresses oversized images
// before the API call, so a large source file is accepted and shrunk on send.
export const MAX_IMAGE_BYTES = 20 * MIB
export const MAX_TEXT_BYTES = MIB
const MAX_ATTACHMENTS = 20
const UNSUPPORTED = 'Unsupported attachment data; choose PNG, JPEG, GIF, WebP, PDF or UTF-8 text'

type BinaryMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'application/pdf'

function binaryMediaType(data: Buffer): BinaryMediaType | undefined {
  if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (data[0] === 255 && data[1] === 216 && data[2] === 255) return 'image/jpeg'
  const header = data.subarray(0, 12).toString('latin1')
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) return 'image/gif'
  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') return 'image/webp'
  if (header.startsWith('%PDF-')) return 'application/pdf'
}

function hasControlCharacters(data: Buffer) {
  return data.some((byte) => (byte < 32 && ![9, 10, 12, 13].includes(byte)) || byte === 127)
}

function isPlainText(data: Buffer) {
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data)
  } catch {
    return false
  }
  return !hasControlCharacters(data)
}

/**
 * Sniff the attachment media type from magic bytes, falling back to the UTF-8
 * text heuristic. Undefined means the format is not accepted.
 */
export function sniffAttachmentType(data: Buffer): string | undefined {
  const binary = binaryMediaType(data)
  if (binary) return binary
  return data.length && isPlainText(data) ? 'text/plain' : undefined
}

function assertSize(size: number, limit: number, label: string) {
  if (size > limit) throw new Error(`${label} limit exceeded (${limit / MIB} MiB)`)
  if (!size) throw new Error('Attachment is empty')
}

function plainText(data: Buffer) {
  assertSize(data.length, MAX_TEXT_BYTES, 'Text attachment size')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data)
  } catch {
    throw new Error(UNSUPPORTED)
  }
  if (hasControlCharacters(data)) {
    throw new Error(UNSUPPORTED)
  }
  return text
}

function fileContent(name: string, data: Buffer): ClaudeAttachmentContent {
  const mediaType = binaryMediaType(data)
  if (mediaType === 'application/pdf') {
    return {
      type: 'document',
      title: name,
      source: { type: 'base64', media_type: mediaType, data: data.toString('base64') },
    }
  }
  if (mediaType) {
    assertSize(data.length, MAX_IMAGE_BYTES, 'Image attachment size')
    return {
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data: data.toString('base64') },
    }
  }
  return {
    type: 'document',
    title: name,
    source: { type: 'text', media_type: 'text/plain', data: plainText(data) },
  }
}

async function readLocalFile(filePath: string, remainingBytes: number, signal: AbortSignal) {
  // Nonblocking open lets us reject FIFOs/device files without waiting for a writer.
  const file = await open(filePath, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    signal.throwIfAborted()
    const stats = await file.stat()
    if (!stats.isFile()) throw new Error('Attachment must be a regular file')
    assertSize(stats.size, MAX_TOTAL_BYTES, 'Attachment size')
    assertSize(stats.size, remainingBytes, 'Total attachment size')
    const chunks: Buffer[] = []
    let bytes = 0
    // The extra byte detects a file growing beyond the bound after stat, without an unbounded read.
    const stream = file.createReadStream({
      start: 0,
      end: remainingBytes,
      autoClose: false,
      signal,
    })
    for await (const chunk of stream) {
      signal.throwIfAborted()
      bytes += chunk.length
      assertSize(bytes, remainingBytes, 'Total attachment size')
      chunks.push(chunk)
    }
    assertSize(bytes, remainingBytes, 'Total attachment size')
    return Buffer.concat(chunks, bytes)
  } finally {
    await file.close()
  }
}

function embeddedContent(content: ClaudeAttachmentContent, remainingBytes: number) {
  if (content.type === 'document' && content.source.type === 'text') {
    if (content.source.media_type !== 'text/plain') throw new Error(UNSUPPORTED)
    const size = Buffer.byteLength(content.source.data)
    assertSize(size, MAX_TEXT_BYTES, 'Text attachment size')
    assertSize(size, remainingBytes, 'Total attachment size')
    plainText(Buffer.from(content.source.data))
    return size
  }
  if (content.source.type !== 'base64') throw new Error(UNSUPPORTED)
  const maxBytes = content.type === 'image' ? MAX_IMAGE_BYTES : MAX_TOTAL_BYTES
  if (content.source.data.length > Math.ceil(maxBytes / 3) * 4) {
    throw new Error(`Attachment size limit exceeded (${maxBytes / MIB} MiB)`)
  }
  const data = Buffer.from(content.source.data, 'base64')
  assertSize(data.length, maxBytes, 'Attachment size')
  assertSize(data.length, remainingBytes, 'Total attachment size')
  if (data.toString('base64') !== content.source.data) throw new Error('Invalid base64 attachment')
  const mediaType = binaryMediaType(data)
  if (
    !mediaType ||
    mediaType !== content.source.media_type ||
    (content.type === 'document'
      ? mediaType !== 'application/pdf'
      : mediaType === 'application/pdf')
  ) {
    throw new Error(UNSUPPORTED)
  }
  return data.length
}

/** `source.path` is clotho-local provenance; the API rejects unknown source fields. */
function sdkContent(content: ClaudeAttachmentContent): ClaudeAttachmentContent {
  if (content.source.path === undefined) return content
  const clone = structuredClone(content)
  delete clone.source.path
  return clone
}

export async function prepareAttachments(
  attachments: ClaudeAttachment[],
  signal: AbortSignal,
): Promise<ClaudeAttachmentContent[]> {
  if (attachments.length > MAX_ATTACHMENTS) {
    throw new Error(`Attachment count limit exceeded (${MAX_ATTACHMENTS} files)`)
  }
  const content: ClaudeAttachmentContent[] = []
  let remainingBytes = MAX_TOTAL_BYTES
  for (const attachment of attachments) {
    signal.throwIfAborted()
    try {
      if (attachment.content) {
        remainingBytes -= embeddedContent(attachment.content, remainingBytes)
        content.push(sdkContent(attachment.content))
      } else {
        const data = await readLocalFile(attachment.path, remainingBytes, signal)
        remainingBytes -= data.length
        content.push(fileContent(attachment.name, data))
      }
    } catch (caught) {
      signal.throwIfAborted()
      const message = caught instanceof Error ? caught.message : 'Unable to read attachment'
      throw new Error(`${attachment.name}: ${message}`, { cause: caught })
    }
  }
  return content
}

function rejectReason(caught: unknown): ClaudeAttachmentRejectReason {
  const message = caught instanceof Error ? caught.message : ''
  if (message.includes('empty')) return 'empty'
  if (message.includes('limit exceeded')) return 'too-large'
  if (message.includes(UNSUPPORTED)) return 'unsupported'
  return 'unreadable'
}

/**
 * Lift picked files or pasted bytes into validated Claude-style content
 * blocks. `source.path` records where picked files came from so the composer
 * can dedupe re-adds; pasted bytes have no path.
 */
export async function loadAttachmentFiles(
  params: ClaudeAttachmentReadParams,
): Promise<ClaudeAttachmentReadResult> {
  if (params.files.length > MAX_ATTACHMENTS) {
    throw new Error(`Attachment count limit exceeded (${MAX_ATTACHMENTS} files)`)
  }
  const attachments: ClaudeLoadedAttachment[] = []
  const rejected: ClaudeAttachmentReadResult['rejected'] = []
  let remainingBytes = MAX_TOTAL_BYTES
  for (const file of params.files) {
    const reject = (reason: ClaudeAttachmentRejectReason) =>
      rejected.push({ name: file.name, reason })
    try {
      let data: Buffer
      if (file.data !== undefined) {
        data = Buffer.from(file.data, 'base64')
        assertSize(data.length, remainingBytes, 'Total attachment size')
      } else if (file.sourcePath) {
        data = await readLocalFile(file.sourcePath, remainingBytes, new AbortController().signal)
      } else {
        reject('unreadable')
        continue
      }
      const content = fileContent(file.name, data)
      content.source.path = file.sourcePath ?? null
      remainingBytes -= data.length
      attachments.push({ name: file.name, path: file.sourcePath ?? null, content })
    } catch (caught) {
      reject(rejectReason(caught))
    }
  }
  return { attachments, rejected }
}

export async function getAttachmentPreview({
  path,
}: ClaudeAttachmentPreviewParams): Promise<ClaudeAttachmentPreview> {
  try {
    const data = await readLocalFile(path, MAX_IMAGE_BYTES, new AbortController().signal)
    const mediaType = binaryMediaType(data)
    if (!mediaType || mediaType === 'application/pdf') return { dataUrl: null }
    return { dataUrl: `data:${mediaType};base64,${data.toString('base64')}` }
  } catch {
    return { dataUrl: null }
  }
}

export async function snapshotAttachments({
  attachments,
}: ClaudePrepareAttachmentsParams): Promise<ClaudePreparedAttachments> {
  const contents = await prepareAttachments(attachments, new AbortController().signal)
  return {
    attachments: contents.map((content, index) => ({ name: attachments[index]!.name, content })),
  }
}
