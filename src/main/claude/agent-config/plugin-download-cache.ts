import { promises as fs } from 'node:fs'
import path from 'node:path'

import { claudePluginsDir } from './marketplace-snapshot'

/**
 * Source cache the CLI keeps for plugins it has downloaded at least once:
 * `~/.claude/plugins/cache/<marketplace>/<plugin>/<revision>/` where the
 * revision leaf is the source sha or version directory and several may
 * coexist. Lets an uninstalled plugin's detail page show real component
 * descriptions. Local-file only; anything missing or unreadable degrades to
 * `undefined` (spec: silent skip).
 */

/**
 * Revision of `<plugin>@<marketplace>` in the download cache, or `undefined`
 * when the plugin was never fetched here. `revisionSha` pins the exact
 * revision when known (the CLI names revision directories by its sha
 * prefix); without it the most recently fetched revision wins.
 */
export async function resolveDownloadedPluginPath(
  marketplace: string,
  pluginName: string,
  pluginsDir = claudePluginsDir(),
  revisionSha?: string,
): Promise<string | undefined> {
  if (!marketplace.trim() || !pluginName.trim()) return undefined
  const pluginDir = path.join(pluginsDir, 'cache', marketplace, pluginName)
  let revisions
  try {
    revisions = await fs.readdir(pluginDir, { withFileTypes: true })
  } catch {
    return undefined
  }
  const sha = revisionSha?.trim()
  const directories = revisions.filter((entry) => entry.isDirectory())
  if (sha) {
    const pinned = directories.find((entry) => sha.startsWith(entry.name) && entry.name !== '')
    if (pinned) return path.join(pluginDir, pinned.name)
  }
  let latest: { path: string; mtimeMs: number } | undefined
  for (const revision of directories) {
    const fullPath = path.join(pluginDir, revision.name)
    try {
      const stat = await fs.stat(fullPath)
      if (!latest || stat.mtimeMs > latest.mtimeMs)
        latest = { path: fullPath, mtimeMs: stat.mtimeMs }
    } catch {
      // Unstatable revision directory → skip it.
    }
  }
  return latest?.path
}
