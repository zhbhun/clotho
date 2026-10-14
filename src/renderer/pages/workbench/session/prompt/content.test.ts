import { describe, expect, it } from 'vitest'

import { promptDocToMarkdown, promptTextToInlineNodes, restorePromptDocument } from './content'

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
    expect(restorePromptDocument(prompt)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'slashCommand', attrs: { name: 'review' } },
            { type: 'text', text: ' inspect ' },
            {
              type: 'fileMention',
              attrs: {
                lineHint: '',
                mimeKind: 'code',
                name: 'quoted "name".tsx',
                path: 'src/folder @draft/quoted "name".tsx',
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

  it('restores line hints as part of the file mention', () => {
    const doc = restorePromptDocument('check @src/app.tsx#L5-11 and @src/main.ts:12')

    expect(doc).toMatchObject({
      content: [
        {
          content: [
            { type: 'text', text: 'check ' },
            {
              type: 'fileMention',
              attrs: { path: 'src/app.tsx', name: 'app.tsx', mimeKind: 'code', lineHint: '#L5-11' },
            },
            { type: 'text', text: ' and ' },
            {
              type: 'fileMention',
              attrs: { path: 'src/main.ts', name: 'main.ts', mimeKind: 'code', lineHint: ':12' },
            },
          ],
        },
      ],
    })
    expect(promptDocToMarkdown(doc)).toBe('check @src/app.tsx#L5-11 and @src/main.ts:12')
  })

  it('treats a missing persisted prompt as an empty document', () => {
    expect(restorePromptDocument(undefined)).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    })
  })
})

describe('restored command chips', () => {
  it('chips slash tokens without consulting the command list', () => {
    const doc = restorePromptDocument('run /archify next')

    expect(doc).toMatchObject({
      content: [
        {
          content: [
            { type: 'text', text: 'run ' },
            { type: 'slashCommand', attrs: { name: 'archify' } },
            { type: 'text', text: ' next' },
          ],
        },
      ],
    })
    expect(promptDocToMarkdown(doc)).toBe('run /archify next')
  })

  it('keeps trailing sentence punctuation out of the chip', () => {
    const doc = restorePromptDocument('run /clear, then /review.')

    expect(doc).toMatchObject({
      content: [
        {
          content: [
            { type: 'text', text: 'run ' },
            { type: 'slashCommand', attrs: { name: 'clear' } },
            { type: 'text', text: ', then ' },
            { type: 'slashCommand', attrs: { name: 'review' } },
            { type: 'text', text: '.' },
          ],
        },
      ],
    })
    expect(promptDocToMarkdown(doc)).toBe('run /clear, then /review.')
  })

  it('keeps slash text without a word-start slash as plain text', () => {
    const doc = restorePromptDocument('abc/reviews stay textual')

    expect(doc).toMatchObject({
      content: [{ content: [{ type: 'text', text: 'abc/reviews stay textual' }] }],
    })
  })
})

describe('pasted prompt text', () => {
  it('chips only file references and keeps slash tokens as text', () => {
    const nodes = promptTextToInlineNodes('see /archify and @src/app.ts')

    expect(nodes).toMatchObject([
      { type: 'text', text: 'see /archify and ' },
      { type: 'fileMention', attrs: { path: 'src/app.ts' } },
    ])
  })
})
