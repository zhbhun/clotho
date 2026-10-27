import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getLogger } from '../../logging/runtime'

const logger = getLogger('agent-config')

export interface WorkflowFileInfo {
  name: string
  lastModifiedMs: number
}

export function claudeWorkflowsDir(claudeDir = path.join(process.env.HOME ?? '', '.claude')) {
  return path.join(claudeDir, 'workflows')
}

const FILE_NAME_RE = /^[\w][\w.-]*$/

function validateWorkflowName(name: string) {
  if (!FILE_NAME_RE.test(name)) throw new Error(`Invalid workflow name: ${name}`)
}

export async function listWorkflows(claudeDir?: string): Promise<WorkflowFileInfo[]> {
  const workflowsDir = claudeWorkflowsDir(claudeDir)
  let entries: string[]
  try {
    entries = await fs.readdir(workflowsDir)
  } catch (caught) {
    if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return []
    logger.warning('agent_config.workflows_list_failed', 'Failed to list workflows', {
      context: { workflowsDir },
      error: caught,
    })
    throw caught
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      try {
        const stat = await fs.stat(path.join(workflowsDir, entry))
        return stat.isFile() ? { name: entry, lastModifiedMs: stat.mtimeMs } : null
      } catch {
        return null
      }
    }),
  )
  return files.filter((file) => file !== null)
}

export async function readWorkflow(name: string, claudeDir?: string): Promise<string> {
  validateWorkflowName(name)
  return fs.readFile(path.join(claudeWorkflowsDir(claudeDir), name), 'utf8')
}

export async function saveWorkflow(
  name: string,
  content: string,
  claudeDir?: string,
): Promise<void> {
  validateWorkflowName(name)
  const workflowsDir = claudeWorkflowsDir(claudeDir)
  await fs.mkdir(workflowsDir, { recursive: true })
  await fs.writeFile(path.join(workflowsDir, name), content, { encoding: 'utf8', mode: 0o600 })
}

export async function renameWorkflow(from: string, to: string, claudeDir?: string): Promise<void> {
  validateWorkflowName(from)
  validateWorkflowName(to)
  const workflowsDir = claudeWorkflowsDir(claudeDir)
  const target = path.join(workflowsDir, to)
  const exists = await fs
    .access(target)
    .then(() => true)
    .catch((caught: NodeJS.ErrnoException) => {
      if (caught.code === 'ENOENT') return false
      throw caught
    })
  if (exists) throw new Error(`A workflow named ${to} already exists`)
  await fs.rename(path.join(workflowsDir, from), target)
}

export async function deleteWorkflow(name: string, claudeDir?: string): Promise<void> {
  validateWorkflowName(name)
  await fs.rm(path.join(claudeWorkflowsDir(claudeDir), name))
}
