import { describe, expect, it } from 'vitest'

import { scoreFuzzyMatch } from './fuzzy-match'

describe('scoreFuzzyMatch', () => {
  it('returns null for a blank query', () => {
    expect(scoreFuzzyMatch('', 'clotho')).toBeNull()
    expect(scoreFuzzyMatch('   ', 'clotho')).toBeNull()
  })

  it('ranks exact above prefix above word boundary above substring above subsequence', () => {
    const exact = scoreFuzzyMatch('clotho', 'clotho')
    const prefix = scoreFuzzyMatch('clo', 'clotho-labs')
    const word = scoreFuzzyMatch('labs', 'clotho-labs')
    const substring = scoreFuzzyMatch('otho', 'clotho-labs')
    const subsequence = scoreFuzzyMatch('clo', 'cache-local-offset')

    expect(exact).not.toBeNull()
    expect(prefix).not.toBeNull()
    expect(word).not.toBeNull()
    expect(substring).not.toBeNull()
    expect(subsequence).not.toBeNull()
    expect(exact!).toBeGreaterThan(prefix!)
    expect(prefix!).toBeGreaterThan(word!)
    expect(word!).toBeGreaterThan(substring!)
    expect(substring!).toBeGreaterThan(subsequence!)
  })

  it('prefers earlier substring hits', () => {
    expect(scoreFuzzyMatch('util', 'renderer/utils/path')!).toBeGreaterThan(
      scoreFuzzyMatch('util', 'src/renderer/services/utils')!,
    )
  })

  it('matches case-insensitively across scripts', () => {
    expect(scoreFuzzyMatch('CLO', 'clotho')).not.toBeNull()
    expect(scoreFuzzyMatch('会话', '历史会话列表')).not.toBeNull()
  })

  it('returns null when no target matches', () => {
    expect(scoreFuzzyMatch('xyz', 'clotho', '/Users/z/clotho')).toBeNull()
    expect(scoreFuzzyMatch('abc', 'abc')).not.toBeNull()
  })

  it('keeps the best score across multiple targets', () => {
    const byPath = scoreFuzzyMatch('clotho', 'workbench', '/Users/z/projects/clotho')!
    const byName = scoreFuzzyMatch('clotho', 'clotho', '/Users/z/projects/clotho')!
    expect(byName).toBeGreaterThan(byPath)
  })

  it('matches scattered characters as a subsequence but rejects broken order', () => {
    expect(scoreFuzzyMatch('cky', 'clotho-key')).not.toBeNull()
    expect(scoreFuzzyMatch('aco', 'clotho')).toBeNull()
  })
})
