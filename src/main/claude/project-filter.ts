import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type NonProjectRootInput = {
  env: NodeJS.ProcessEnv
  homedir: string
  platform: NodeJS.Platform
  tmpdir: string
}

function pathApiFor(platform: NodeJS.Platform) {
  return platform === 'win32' ? path.win32 : path.posix
}

/**
 * Roots whose subtrees hold OS- or app-managed data rather than user projects.
 * Sessions launched from these locations (temp scratch dirs, probe folders,
 * application data) should not surface as projects.
 */
export function nonProjectRoots({ env, homedir, platform, tmpdir }: NonProjectRootInput): string[] {
  const pathApi = pathApiFor(platform)
  const roots = new Set<string>()
  const add = (candidate?: string) => {
    if (candidate?.trim()) roots.add(pathApi.resolve(candidate))
  }

  add(tmpdir)
  if (platform === 'darwin') {
    add('/tmp')
    add('/var/tmp')
    add('/var/folders')
    // App-managed subtrees of ~/Library; ~/Library/Mobile Documents (iCloud
    // Drive) stays visible because users do keep real documents there.
    const library = pathApi.join(homedir, 'Library')
    add(pathApi.join(library, 'Application Support'))
    add(pathApi.join(library, 'Caches'))
    add(pathApi.join(library, 'Containers'))
    add(pathApi.join(library, 'Group Containers'))
  } else if (platform === 'win32') {
    add(env.TEMP)
    add(env.TMP)
    add(env.LOCALAPPDATA)
    add(env.APPDATA)
    add(pathApi.join(env.SystemRoot ?? 'C:\\Windows', 'Temp'))
  } else {
    add('/tmp')
    add('/var/tmp')
    add('/dev/shm')
    add(env.XDG_RUNTIME_DIR)
    add(env.XDG_CACHE_HOME ?? pathApi.join(homedir, '.cache'))
    add(env.XDG_DATA_HOME ?? pathApi.join(homedir, '.local', 'share'))
  }
  return [...roots]
}

export function isNonProjectPath(
  candidatePath: string,
  roots: string[],
  platform: NodeJS.Platform = process.platform,
) {
  const pathApi = pathApiFor(platform)
  const normalize = (value: string) => {
    const resolved = pathApi.resolve(value)
    return platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  const candidate = normalize(candidatePath)
  return roots.some((root) => {
    const needle = normalize(root)
    return candidate === needle || candidate.startsWith(needle + pathApi.sep)
  })
}

/**
 * Session-discovered projects outside the user's home directory are usually
 * scratch or tool-managed locations, so they stay hidden. Windows is exempt:
 * projects there commonly live on other drives (D:\, E:\).
 */
export function isOutsideHomePath(
  candidatePath: string,
  homedir: string,
  platform: NodeJS.Platform = process.platform,
) {
  if (platform === 'win32') return false
  const pathApi = pathApiFor(platform)
  const home = pathApi.resolve(homedir)
  const candidate = pathApi.resolve(candidatePath)
  return candidate !== home && !candidate.startsWith(home + pathApi.sep)
}

let cachedRoots: Promise<string[]> | undefined

/**
 * Platform roots plus their realpath variants, so session cwds match in either
 * spelling (e.g. macOS /var/folders ↔ /private/var/folders, /tmp ↔ /private/tmp).
 */
export function resolvedNonProjectRoots(): Promise<string[]> {
  cachedRoots ??= (async () => {
    const roots = nonProjectRoots({
      env: process.env,
      homedir: os.homedir(),
      platform: process.platform,
      tmpdir: os.tmpdir(),
    })
    const realRoots = await Promise.all(
      roots.map(async (root) => {
        try {
          return path.resolve(await fs.realpath(root))
        } catch {
          return null
        }
      }),
    )
    return [...new Set([...roots, ...realRoots.filter((root): root is string => root !== null)])]
  })()
  return cachedRoots
}
