import { describe, expect, it } from 'vitest'

import { draftTitleFromPrompt } from './draft-title'

describe('draft title', () => {
  it('keeps an attachment-only draft and names it from its first attachment', () => {
    const attachments = [{ name: 'diagram.png', path: '/project/diagram.png' }]
    expect(draftTitleFromPrompt('', attachments)).toBe('diagram.png')
  })

  it('uses the first non-empty line as the draft title', () => {
    expect(draftTitleFromPrompt('\n  Review the API migration  \nInclude tests')).toBe(
      'Review the API migration',
    )
  })

  it('falls back to an attachment title when a persisted prompt is missing', () => {
    expect(
      draftTitleFromPrompt(undefined as unknown as string, [
        { name: 'diagram.png', path: '/project/diagram.png' },
      ]),
    ).toBe('diagram.png')
  })
})
