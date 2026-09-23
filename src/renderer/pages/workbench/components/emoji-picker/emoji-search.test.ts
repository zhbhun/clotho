import { describe, expect, it } from 'vitest'

import { EMOJI_ENTRIES, EMOJI_SUGGESTED_ENTRIES } from './emoji-data'
import { searchEmojis } from './emoji-search'

describe('searchEmojis', () => {
  it('matches label, tags and shortcodes case-insensitively', () => {
    const results = searchEmojis(EMOJI_ENTRIES, 'THUMBS Up')
    expect(results.some((entry) => entry.keywords.includes('thumbs up'))).toBe(true)
  })

  it('requires every whitespace-separated term to match', () => {
    expect(searchEmojis(EMOJI_ENTRIES, 'grinning face').length).toBeGreaterThan(0)
    expect(
      searchEmojis(EMOJI_ENTRIES, 'grinning face rocket').some((entry) =>
        entry.keywords.includes('grinning face'),
      ),
    ).toBe(false)
  })

  it('returns nothing for blank queries', () => {
    expect(searchEmojis(EMOJI_ENTRIES, '')).toEqual([])
    expect(searchEmojis(EMOJI_ENTRIES, '   ')).toEqual([])
  })

  it('takes suggested entries from the dataset with searchable keywords', () => {
    expect(EMOJI_SUGGESTED_ENTRIES.length).toBe(8)
    for (const entry of EMOJI_SUGGESTED_ENTRIES) {
      expect(entry.keywords.length).toBeGreaterThan(0)
      expect(
        EMOJI_ENTRIES.some(
          (candidate) => candidate.char === entry.char && candidate.keywords === entry.keywords,
        ),
      ).toBe(true)
    }
  })
})
