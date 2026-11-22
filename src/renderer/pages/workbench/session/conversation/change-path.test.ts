import { describe, expect, it } from 'vitest'

import { changeDisplayPath, fitChangePath } from './change-path'

describe('changeDisplayPath', () => {
  it('prefers project-relative paths and abbreviates only the actual home directory', () => {
    expect(
      changeDisplayPath('/Users/alice/repo/src/a.ts', '/Users/alice/repo', '/Users/alice'),
    ).toBe('src/a.ts')
    expect(changeDisplayPath('/Users/alice/other/a.ts', '/repo', '/Users/alice')).toBe(
      '~/other/a.ts',
    )
    expect(changeDisplayPath('/Users/alice2/a.ts', '/repo', '/Users/alice')).toBe(
      '/Users/alice2/a.ts',
    )
    expect(changeDisplayPath('C:\\Users\\alice\\repo\\a.ts', undefined, 'C:\\Users\\alice\\')).toBe(
      '~/repo/a.ts',
    )
  })
})

describe('fitChangePath', () => {
  const path = '~/Projects/meitu/server/doc/api/console/wash_task.md'
  const measure = (text: string) => text.length

  it('keeps a fitting path and removes middle directories as the width shrinks', () => {
    expect(fitChangePath(path, 100, measure)).toBe(path)
    expect(fitChangePath(path, 30, measure)).toBe('~/.../api/console/wash_task.md')
    expect(fitChangePath(path, 26, measure)).toBe('~/.../console/wash_task.md')
    expect(fitChangePath(path, 20, measure)).toBe('~/.../wash_task.md')
    expect(fitChangePath(path, 15, measure)).toBe('wash_task.md')
    expect(fitChangePath(path, 100, measure)).toBe(path)
  })

  it('preserves the extension when even the filename needs compaction', () => {
    expect(fitChangePath('very_long_filename.test.ts', 16, measure)).toBe('very_long_....ts')
  })
})
