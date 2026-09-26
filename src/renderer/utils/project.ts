import type { ClaudeProject } from '../services/claude/claude'

export function projectNameFromPath(projectPath: string) {
  const parts = projectPath.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? projectPath
}

export function projectDisplayName(project: Pick<ClaudeProject, 'name' | 'path'>) {
  return project.name?.trim() || projectNameFromPath(project.path)
}

/** The built-in home project backs home mode; it is the fallback, never a listed project. */
export function isUserProject(project: Pick<ClaudeProject, 'is_home'>) {
  return !project.is_home
}

export function compareProjectsByName(
  left: Pick<ClaudeProject, 'name' | 'path'>,
  right: Pick<ClaudeProject, 'name' | 'path'>,
) {
  const byName = projectDisplayName(left).localeCompare(projectDisplayName(right), undefined, {
    sensitivity: 'base',
  })
  return byName || left.path.localeCompare(right.path, undefined, { sensitivity: 'base' })
}
