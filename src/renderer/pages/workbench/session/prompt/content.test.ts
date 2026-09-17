import { describe, expect, it } from 'vitest'

import { promptDocToMarkdown, restorePromptDocument } from './content'

const commands = [
  {
    name: 'review',
    description: 'Review code changes.',
    aliases: ['code-review'],
    argumentHint: '[scope]',
  },
]

describe('prompt content persistence', () => {
  it('round-trips every editor-supported node through one prompt string', () => {
    const prompt = promptDocToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'slashCommand', attrs: commands[0] },
            { type: 'text', text: ' inspect ' },
            {
              type: 'fileMention',
              attrs: {
                path: 'src/folder @draft/quoted "name".tsx',
                name: 'quoted "name".tsx',
                mimeKind: 'code',
              },
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'Keep **markdown** as source text.' },
          ],
        },
      ],
    })

    expect(prompt).toBe(
      '/review inspect @"src/folder @draft/quoted \\"name\\".tsx"\n' +
        'Keep **markdown** as source text.',
    )
    expect(restorePromptDocument(prompt, commands)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'slashCommand',
              attrs: {
                aliases: ['code-review'],
                argumentHint: '[scope]',
                description: 'Review code changes.',
                name: 'review',
              },
            },
            { type: 'text', text: ' inspect ' },
            {
              type: 'fileMention',
              attrs: {
                path: 'src/folder @draft/quoted "name".tsx',
                name: 'quoted "name".tsx',
                mimeKind: 'code',
              },
            },
            { type: 'hardBreak' },
            { type: 'text', text: 'Keep **markdown** as source text.' },
          ],
        },
      ],
    })
  })

  it('keeps ordinary file mentions readable', () => {
    const prompt = promptDocToMarkdown({
      type: 'fileMention',
      attrs: { path: 'src/index.ts' },
    })

    expect(prompt).toBe('@src/index.ts')
    expect(restorePromptDocument(prompt)).toMatchObject({
      content: [{ content: [{ type: 'fileMention', attrs: { path: 'src/index.ts' } }] }],
    })
  })

  it('treats a missing persisted prompt as an empty document', () => {
    expect(restorePromptDocument(undefined)).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    })
  })
})
