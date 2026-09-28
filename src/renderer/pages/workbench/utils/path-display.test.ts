import { describe, expect, it } from 'vitest'

import { shortMiddlePath, tildePath } from './path-display'

describe('tildePath', () => {
  it('collapses the user-home prefix to ~', () => {
    expect(tildePath('/Users/zhanghuabin/Projects/clotho')).toBe('~/Projects/clotho')
    expect(tildePath('/Users/zhanghuabin')).toBe('~')
  })

  it('leaves paths outside home untouched', () => {
    expect(tildePath('/opt/local/share')).toBe('/opt/local/share')
    expect(tildePath('relative/path')).toBe('relative/path')
  })
})

describe('shortMiddlePath', () => {
  it('returns paths that fit unchanged', () => {
    expect(shortMiddlePath('~/Projects/clotho', 17)).toBe('~/Projects/clotho')
  })

  it('elides the middle and keeps both ends within max', () => {
    const path = '~/Projects/source/ai/claude-code-plugin'
    expect(shortMiddlePath(path, 24)).toBe('~/Projects...code-plugin')
  })

  it('degrades to a head cut when max cannot fit the ellipsis', () => {
    expect(shortMiddlePath('abcdef', 2)).toBe('ab')
  })
})
