import { pickString } from './utils'

const FILE_TOOL_NAMES = new Set([
  'Read',
  'FileReadTool',
  'ReadCoalesced',
  'Write',
  'FileWriteTool',
  'Edit',
  'FileEditTool',
])

export function isFileToolName(name?: string): boolean {
  return Boolean(name && FILE_TOOL_NAMES.has(name))
}

export function fileToolSummary(input: unknown, projectPath?: string): string {
  return formatDisplayPath(filePath(input), projectPath)
}

export function fileSummary(input: unknown): string {
  return fileName(filePath(input))
}

export function filePath(input: unknown): string {
  return pickString(input, ['file_path', 'path'])
}

export function fileName(path: string): string {
  if (!path) return ''
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

export function formatDisplayPath(path: string, projectPath?: string): string {
  if (!path) return ''
  return compactDisplayPath(relativeProjectPath(path, projectPath))
}

function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/')
}

function relativeProjectPath(path: string, projectPath?: string): string {
  if (!path || !projectPath) return path
  const normalizedPath = normalizePathSeparators(path)
  const normalizedProject = normalizePathSeparators(projectPath).replace(/\/+$/, '')
  if (!normalizedProject) return path
  if (normalizedPath === normalizedProject) return fileName(path)
  if (normalizedPath.startsWith(`${normalizedProject}/`)) {
    return normalizedPath.slice(normalizedProject.length + 1)
  }
  return path
}

function compactDisplayPath(path: string): string {
  if (!path) return ''
  const normalized = normalizePathSeparators(path)
  const hasRootSlash = normalized.startsWith('/')
  const parts = normalized.split('/').filter(Boolean)
  if (parts.length <= 4) return normalized
  const compacted = [...parts.slice(0, 2), '...', ...parts.slice(-2)].join('/')
  return hasRootSlash ? `/${compacted}` : compacted
}
