import { describe, expect, it } from 'vitest'

import { draftTitleFromPrompt } from './draft-title'

describe('draft title', () => {
  it('uses the first non-empty line as the draft title', () => {
    expect(draftTitleFromPrompt('\n  Review the API migration  \nInclude tests')).toBe(
      'Review the API migration',
    )
  })

  it('returns an empty title for an attachment-only draft so it keeps the default name', () => {
    expect(draftTitleFromPrompt('')).toBe('')
  })

  it('returns an empty title when a persisted prompt is missing', () => {
    expect(draftTitleFromPrompt(undefined)).toBe('')
  })
})
