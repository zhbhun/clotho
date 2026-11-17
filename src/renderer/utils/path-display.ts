const HOME_PREFIX_PATTERN = /^\/Users\/[^/]+/
const MIDDLE_ELLIPSIS = '...'

/** Collapse the user-home prefix of a filesystem path to `~`. */
export function tildePath(path: string) {
  return path.replace(HOME_PREFIX_PATTERN, '~')
}

/** Elide the middle of an over-long path so both ends stay visible:
    `~/Projects/so.../claude-code-plugin`. */
export function shortMiddlePath(path: string, max: number) {
  if (path.length <= max) return path

  const keep = max - MIDDLE_ELLIPSIS.length
  if (keep < 1) return path.slice(0, max)

  const head = Math.floor(keep / 2)
  return `${path.slice(0, head)}${MIDDLE_ELLIPSIS}${path.slice(head - keep)}`
}
