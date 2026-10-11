import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Where a markdown link click should go: the operating system, the local
 * filesystem, or nowhere.
 */
export type LinkTarget =
  { kind: 'external'; url: string } | { kind: 'file'; filePath: string } | { kind: 'ignore' }

const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])

export type OpenLinkParams = { href: string; projectPath: string }
export type OpenLinkResult = { opened: boolean }

export type OpenLinkDeps = {
  openExternal: (url: string) => Promise<void>
  showItemInFolder: (filePath: string) => void
  pathExists: (filePath: string) => Promise<boolean>
}

export function resolveLinkTarget(href: string, projectPath: string): LinkTarget {
  const trimmed = href.trim()
  if (!trimmed || trimmed.startsWith('#')) {
    return { kind: 'ignore' }
  }

  try {
    const parsed = new URL(trimmed)
    if (EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
      return { kind: 'external', url: trimmed }
    }
    if (parsed.protocol === 'file:') {
      return containedFileTarget(fileURLToPath(parsed), projectPath)
    }
    return { kind: 'ignore' }
  } catch {
    // Not an absolute URL: a filesystem path relative to the project root.
  }

  return containedFileTarget(path.resolve(projectPath, trimmed), projectPath)
}

/**
 * File links may only land inside the project that produced them; absolute
 * paths and `../` escapes would let a reply open arbitrary local files.
 */
function containedFileTarget(filePath: string, projectPath: string): LinkTarget {
  if (!projectPath) {
    return { kind: 'ignore' }
  }
  const relative = path.relative(projectPath, filePath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { kind: 'ignore' }
  }
  return { kind: 'file', filePath }
}

export async function openLink(
  params: OpenLinkParams,
  deps: OpenLinkDeps,
): Promise<OpenLinkResult> {
  const target = resolveLinkTarget(params.href, params.projectPath)
  if (target.kind === 'ignore') {
    return { opened: false }
  }
  if (target.kind === 'external') {
    await deps.openExternal(target.url)
    return { opened: true }
  }
  if (!(await deps.pathExists(target.filePath))) {
    return { opened: false }
  }
  // Reveal instead of open: file extensions like .ts are double-booked by
  // LaunchServices (TypeScript vs MPEG transport stream), so the system
  // default application can be a media player. The file manager lets the
  // user pick the app.
  deps.showItemInFolder(target.filePath)
  return { opened: true }
}
