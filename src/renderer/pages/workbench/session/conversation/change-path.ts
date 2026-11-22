import { relativeDisplayPath } from '../tools/shared/file-path'

export function changeDisplayPath(path: string, projectPath?: string, homePath?: string): string {
  const relative = relativeDisplayPath(path, projectPath)
  const home = homePath?.replace(/\\/g, '/').replace(/\/+$/, '')
  if (home && (relative === home || relative.startsWith(`${home}/`))) {
    return `~${relative.slice(home.length)}`
  }
  return relative
}

/** Remove middle directories first, then middle characters of an oversized filename. */
export function fitChangePath(
  path: string,
  width: number,
  measure: (text: string) => number,
): string {
  if (measure(path) <= width) return path
  const parts = path.split('/')
  const name = parts.pop() ?? path
  const root = parts.shift()
  if (root !== undefined) {
    while (parts.length) {
      parts.shift()
      const candidate = [root, '...', ...parts, name].join('/')
      if (measure(candidate) <= width) return candidate
    }
    const candidate = `.../${name}`
    if (measure(candidate) <= width) return candidate
  }
  if (measure(name) <= width) return name

  // Preserve the extension and as much of the filename's end as space allows.
  const extension = name.lastIndexOf('.')
  const suffixLength = extension > 0 ? name.length - extension : 1
  for (let length = name.length - 1; length > 0; length--) {
    const end = Math.min(suffixLength, length)
    const candidate = `${name.slice(0, length - end)}...${name.slice(-end)}`
    if (measure(candidate) <= width) return candidate
  }
  return '...'
}
