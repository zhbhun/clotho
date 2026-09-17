// @vitest-environment node
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ClaudeAttachment } from '@/shared/rpc'

import { getAttachmentPreview, prepareAttachments, snapshotAttachments } from './attachments'

describe('attachment content preparation', () => {
  let directory: string
  let signal: AbortSignal

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'clotho-attachments-'))
    signal = new AbortController().signal
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  async function fixture(name: string, data: string | Buffer): Promise<ClaudeAttachment> {
    const filePath = path.join(directory, name)
    await writeFile(filePath, data)
    return { name, path: filePath }
  }

  async function largeFixture(name: string, header: string | Buffer, size: number) {
    const attachment = await fixture(name, header)
    const file = await open(attachment.path!, 'r+')
    try {
      await file.truncate(size)
    } finally {
      await file.close()
    }
    return attachment
  }

  it('provides a local PNG preview as an exact image data URL without relying on file://', async () => {
    const attachment = await fixture(
      'renamed.dat',
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
        'base64',
      ),
    )

    expect(await getAttachmentPreview({ path: attachment.path! })).toEqual({
      dataUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    })
  })

  it('does not read an oversized image into a preview', async () => {
    const attachment = await largeFixture(
      'huge.png',
      Buffer.from('iVBORw0KGgo=', 'base64'),
      5 * 1024 * 1024 + 1,
    )

    expect(await getAttachmentPreview({ path: attachment.path! })).toEqual({
      dataUrl: null,
    })
  })

  it.each([
    { name: 'notes.txt', data: 'Hello' },
    { name: 'not-image.png', data: '%PDF-1.4' },
    { name: 'vector.svg', data: '<svg xmlns="http://www.w3.org/2000/svg" />' },
    { name: 'binary.png', data: Buffer.from([0, 1, 2]) },
  ])('returns no preview for nonimage content in $name', async ({ name, data }) => {
    const attachment = await fixture(name, data)

    expect(await getAttachmentPreview({ path: attachment.path! })).toEqual({
      dataUrl: null,
    })
  })

  it('returns no preview when the local file is missing or is a directory', async () => {
    expect(await getAttachmentPreview({ path: path.join(directory, 'missing.png') })).toEqual({
      dataUrl: null,
    })
    expect(await getAttachmentPreview({ path: directory })).toEqual({ dataUrl: null })
  })

  it('captures named attachment contents before a later rewind removes their local files', async () => {
    const attachment = await fixture('notes.txt', 'Contents before rewind')

    const result = await snapshotAttachments({
      attachments: [{ ...attachment, name: 'Selected notes' }],
    })
    await rm(attachment.path!)

    expect(result).toEqual({
      attachments: [
        {
          name: 'Selected notes',
          content: {
            type: 'document',
            title: 'Selected notes',
            source: { type: 'text', media_type: 'text/plain', data: 'Contents before rewind' },
          },
        },
      ],
    })
  })

  it('fails attachment capture when any selected file cannot be read', async () => {
    const attachment = await fixture('notes.txt', 'Contents before rewind')
    const result = snapshotAttachments({
      attachments: [attachment, { name: 'Missing', path: path.join(directory, 'missing') }],
    })

    await expect(result).rejects.toThrow(/Missing/)
  })

  it.each([
    { mediaType: 'image/png', base64: 'iVBORw0KGgo=', type: 'image' },
    { mediaType: 'image/jpeg', base64: '/9j/2w==', type: 'image' },
    { mediaType: 'image/gif', base64: 'R0lGODlh', type: 'image' },
    { mediaType: 'image/webp', base64: 'UklGRgQAAABXRUJQ', type: 'image' },
    { mediaType: 'application/pdf', base64: 'JVBERi0xLjQKJSVFT0Y=', type: 'document' },
  ])(
    'detects $mediaType from file bytes instead of its extension',
    async ({ mediaType, base64, type }) => {
      const attachment = await fixture('renamed.dat', Buffer.from(base64, 'base64'))

      await expect(prepareAttachments([attachment], signal)).resolves.toEqual([
        {
          type,
          ...(type === 'document' ? { title: 'renamed.dat' } : {}),
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
      ])
    },
  )

  it('preserves UTF-8 code and document contents without truncation', async () => {
    const attachment = await fixture('notes.md', '# 标题\n\ttext\r\n🙂')

    await expect(prepareAttachments([attachment], signal)).resolves.toEqual([
      {
        type: 'document',
        title: 'notes.md',
        source: { type: 'text', media_type: 'text/plain', data: '# 标题\n\ttext\r\n🙂' },
      },
    ])
  })

  it.each([
    { name: 'archive.zip', data: Buffer.from([0x50, 0x4b, 3, 4, 0, 0]) },
    { name: 'invalid-utf8.txt', data: Buffer.from([0xc3, 0x28]) },
    { name: 'binary.txt', data: Buffer.from('hello\u0000world') },
  ])('rejects unsupported binary data in $name', async ({ name, data }) => {
    const attachment = await fixture(name, data)

    await expect(prepareAttachments([attachment], signal)).rejects.toThrow(/unsupported|UTF-8/i)
  })

  it('rejects directories with a file-specific explanation', async () => {
    await expect(prepareAttachments([{ name: 'folder', path: directory }], signal)).rejects.toThrow(
      /folder.*regular file/i,
    )
  })

  it('rejects unreadable paths with the attachment name', async () => {
    await expect(
      prepareAttachments(
        [{ name: 'missing.txt', path: path.join(directory, 'missing.txt') }],
        signal,
      ),
    ).rejects.toThrow(/missing.txt/)
  })

  it('rejects empty files instead of submitting an empty document', async () => {
    const attachment = await fixture('empty.txt', '')

    await expect(prepareAttachments([attachment], signal)).rejects.toThrow(/empty/i)
  })

  it.each([
    { name: 'large.png', header: Buffer.from('iVBORw0KGgo=', 'base64'), size: 5 * 1024 * 1024 + 1 },
    { name: 'large.pdf', header: '%PDF-1.4', size: 20 * 1024 * 1024 + 1 },
    { name: 'large.txt', header: 'text', size: 1024 * 1024 + 1 },
  ])(
    'rejects oversized $name rather than truncating its content',
    async ({ name, header, size }) => {
      const attachment = await largeFixture(name, header, size)

      await expect(prepareAttachments([attachment], signal)).rejects.toThrow(/large.*limit/i)
    },
  )

  it('bounds the combined file content even when individual PDFs are allowed', async () => {
    const first = await largeFixture('first.pdf', '%PDF-1.4', 11 * 1024 * 1024)
    const second = await largeFixture('second.pdf', '%PDF-1.4', 11 * 1024 * 1024)

    await expect(prepareAttachments([first, second], signal)).rejects.toThrow(/total.*limit/i)
  })

  it('rejects an excessive attachment count before reading files', async () => {
    const files = Array.from({ length: 21 }, (_, index) => ({
      name: `missing-${index}`,
      path: '/missing',
    }))

    await expect(prepareAttachments(files, signal)).rejects.toThrow(/attachment.*limit/i)
  })

  it('reuses embedded image content without requiring the original local file', async () => {
    await expect(
      prepareAttachments(
        [
          {
            name: 'saved.png',
            content: {
              type: 'image',
              source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
            },
          },
        ],
        signal,
      ),
    ).resolves.toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
    ])
  })

  it.each([
    { data: 'not base64!', mediaType: 'image/png' },
    { data: 'iVBORw0KGgo=', mediaType: 'image/jpeg' },
    { data: 'aGVsbG8=', mediaType: 'image/png' },
  ] as const)(
    'rejects malformed or mismatched stored image contents ($mediaType: $data)',
    async ({ data, mediaType }) => {
      await expect(
        prepareAttachments(
          [
            {
              name: 'saved.png',
              content: { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            },
          ],
          signal,
        ),
      ).rejects.toThrow(/saved.png/)
    },
  )

  it('applies the text size limit to embedded history attachments too', async () => {
    await expect(
      prepareAttachments(
        [
          {
            name: 'large.txt',
            content: {
              type: 'document',
              source: { type: 'text', media_type: 'text/plain', data: 'x'.repeat(1024 * 1024 + 1) },
            },
          },
        ],
        signal,
      ),
    ).rejects.toThrow(/large.txt.*limit/i)
  })
})
