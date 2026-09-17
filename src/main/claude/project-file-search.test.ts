// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { createProjectFileSearchService, isSafeProjectSearchRoot } from './project-file-search'

const projectPath = '/Users/test/project'

function gitSmallProjectRunner(files: string[] = ['src/main.ts']) {
  return vi.fn(async (command: string, args: string[]) => {
    if (command === 'git' && args.includes('rev-parse')) {
      return { ok: true, stdout: 'true\n' }
    }
    if (command === 'git' && args.includes('ls-files')) {
      return { ok: true, stdout: `${files.join('\0')}\0` }
    }
    if (command === 'rg' && args.includes('--version')) {
      return { ok: true, stdout: 'ripgrep 15.0.0\n' }
    }
    return { ok: false, stdout: '' }
  })
}

describe('project file search safety', () => {
  it('rejects broad roots before enabling @ search', () => {
    expect(isSafeProjectSearchRoot('/', '/Users/test')).toBe(false)
    expect(isSafeProjectSearchRoot('~', '/Users/test')).toBe(false)
    expect(isSafeProjectSearchRoot('/Users', '/Users/test')).toBe(false)
    expect(isSafeProjectSearchRoot('/Users/test', '/Users/test')).toBe(false)
    expect(isSafeProjectSearchRoot('C:\\', 'C:\\Users\\test')).toBe(false)
    expect(isSafeProjectSearchRoot('C:\\Users', 'C:\\Users\\test')).toBe(false)

    expect(isSafeProjectSearchRoot('/Users/test/project', '/Users/test')).toBe(true)
  })
})

describe('createProjectFileSearchService', () => {
  it('warms fff for small git projects and destroys it after idle exit', async () => {
    vi.useFakeTimers()
    const destroy = vi.fn()
    const createFffFinder = vi.fn(() => ({
      destroy,
      mixedSearch: vi.fn(),
      waitForScan: vi.fn(async () => ({ ok: true as const, value: true })),
    }))
    const service = createProjectFileSearchService({
      createFffFinder,
      idleDestroyMs: 100,
      runCommand: gitSmallProjectRunner(),
    })

    await expect(service.enterWarmup({ projectPath })).resolves.toMatchObject({
      supported: true,
      strategy: 'fff',
    })
    expect(createFffFinder).toHaveBeenCalledTimes(1)

    await service.exitWarmup({ projectPath })
    expect(destroy).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(100)
    expect(destroy).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
