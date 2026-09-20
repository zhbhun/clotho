// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isNonProjectPath, nonProjectRoots, resolvedNonProjectRoots } from './project-filter'

describe('nonProjectRoots', () => {
  it('covers macOS temp and app-managed Library folders', () => {
    const roots = nonProjectRoots({
      env: {},
      homedir: '/Users/alice',
      platform: 'darwin',
      tmpdir: '/var/folders/xx/T',
    })

    expect(roots).toEqual(
      expect.arrayContaining([
        '/var/folders/xx/T',
        '/tmp',
        '/var/tmp',
        '/var/folders',
        '/Users/alice/Library/Application Support',
        '/Users/alice/Library/Caches',
        '/Users/alice/Library/Containers',
        '/Users/alice/Library/Group Containers',
      ]),
    )
  })

  it('covers Windows temp and AppData folders from the environment', () => {
    const roots = nonProjectRoots({
      env: {
        TEMP: 'C:\\Users\\alice\\AppData\\Local\\Temp',
        LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local',
        APPDATA: 'C:\\Users\\alice\\AppData\\Roaming',
        SystemRoot: 'C:\\Windows',
      },
      homedir: 'C:\\Users\\alice',
      platform: 'win32',
      tmpdir: 'C:\\Users\\alice\\AppData\\Local\\Temp',
    })

    expect(roots).toEqual(
      expect.arrayContaining([
        'C:\\Users\\alice\\AppData\\Local\\Temp',
        'C:\\Users\\alice\\AppData\\Local',
        'C:\\Users\\alice\\AppData\\Roaming',
        'C:\\Windows\\Temp',
      ]),
    )
  })

  it('covers Linux temp and XDG folders', () => {
    const roots = nonProjectRoots({
      env: { XDG_RUNTIME_DIR: '/run/user/1000' },
      homedir: '/home/alice',
      platform: 'linux',
      tmpdir: '/tmp',
    })

    expect(roots).toEqual(
      expect.arrayContaining([
        '/tmp',
        '/var/tmp',
        '/dev/shm',
        '/run/user/1000',
        '/home/alice/.cache',
        '/home/alice/.local/share',
      ]),
    )
  })
})

describe('isNonProjectPath', () => {
  const roots = ['/tmp', '/Users/alice/Library/Application Support']

  it('matches a root directory and its descendants only', () => {
    expect(isNonProjectPath('/tmp', roots, 'darwin')).toBe(true)
    expect(isNonProjectPath('/tmp/clotho-probe-XuEDrR', roots, 'darwin')).toBe(true)
    expect(isNonProjectPath('/tmpfoo', roots, 'darwin')).toBe(false)
    expect(isNonProjectPath('/Users/alice/Projects/clotho', roots, 'darwin')).toBe(false)
  })

  it('matches app-managed data folders while leaving iCloud documents visible', () => {
    expect(
      isNonProjectPath(
        '/Users/alice/Library/Application Support/Open Design/data/projects/39bfc6b9',
        roots,
        'darwin',
      ),
    ).toBe(true)
    expect(
      isNonProjectPath(
        '/Users/alice/Library/Mobile Documents/com~apple~CloudDocs/notes',
        roots,
        'darwin',
      ),
    ).toBe(false)
  })

  it('does not match symlinked spelling variants unless resolved into the roots', () => {
    // resolvedNonProjectRoots() adds realpath variants; the raw list alone does
    // not pretend /tmp and /private/tmp are the same string prefix.
    expect(isNonProjectPath('/private/tmp/scratch', roots, 'darwin')).toBe(false)
  })

  it('matches Windows paths case-insensitively', () => {
    const windowsRoots = ['C:\\Users\\alice\\AppData\\Local\\Temp']

    expect(
      isNonProjectPath('c:\\users\\ALICE\\appdata\\local\\temp\\probe', windowsRoots, 'win32'),
    ).toBe(true)
    expect(isNonProjectPath('D:\\work\\clotho', windowsRoots, 'win32')).toBe(false)
  })
})

describe('resolvedNonProjectRoots', () => {
  it.runIf(process.platform === 'darwin')(
    'includes realpath variants of symlinked macOS roots',
    async () => {
      const roots = await resolvedNonProjectRoots()

      expect(roots).toContain('/tmp')
      expect(roots).toContain('/private/tmp')
      expect(roots).toContain('/private/var/folders')
    },
  )
})
