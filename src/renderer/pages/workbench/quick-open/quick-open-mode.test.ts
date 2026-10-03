import { describe, expect, it } from 'vitest'

import { parseQuickOpenQuery } from './quick-open-mode'

describe('parseQuickOpenQuery', () => {
  it('routes each prefix to its mode and keeps the rest as the filter', () => {
    expect(parseQuickOpenQuery('~clotho')).toEqual({ filter: 'clotho', mode: 'projects' })
    expect(parseQuickOpenQuery('# fix')).toEqual({ filter: ' fix', mode: 'allSessions' })
    expect(parseQuickOpenQuery('@')).toEqual({ filter: '', mode: 'projectSessions' })
    expect(parseQuickOpenQuery(':')).toEqual({ filter: '', mode: 'sentMessages' })
  })

  it('falls back to the default mode without a prefix', () => {
    expect(parseQuickOpenQuery('')).toEqual({ filter: '', mode: 'default' })
    expect(parseQuickOpenQuery('clotho')).toEqual({ filter: 'clotho', mode: 'default' })
    expect(parseQuickOpenQuery(' ~x')).toEqual({ filter: ' ~x', mode: 'default' })
  })
})
