import { recordValue } from './utils'

export interface TaskListRow {
  id: string
  subject: string
  status: string
  blockedBy?: string[]
}

export interface TaskDetail {
  id?: string
  subject?: string
  description?: string
  status?: string
}

export function extractTaskList(toolUseResult: unknown): TaskListRow[] {
  const tasks = recordValue(toolUseResult).tasks
  if (!Array.isArray(tasks)) return []

  return tasks
    .filter((task): task is Record<string, unknown> => Boolean(task && typeof task === 'object'))
    .map((task) => ({
      id: typeof task.id === 'string' || typeof task.id === 'number' ? String(task.id) : '',
      subject: typeof task.subject === 'string' ? task.subject : '',
      status: typeof task.status === 'string' ? task.status : 'pending',
      blockedBy: Array.isArray(task.blockedBy) ? (task.blockedBy as string[]) : undefined,
    }))
    .filter((task) => task.id || task.subject)
}

export function extractTaskDetail(toolUseResult: unknown): TaskDetail | null {
  const task = recordValue(recordValue(toolUseResult).task)
  if (!Object.keys(task).length) return null
  return task as TaskDetail
}

export function extractCronJobs(toolUseResult: unknown): unknown[] {
  const jobs = recordValue(toolUseResult).jobs
  return Array.isArray(jobs) ? jobs : []
}

export function normalizeTaskStatus(status: unknown): 'pending' | 'in_progress' | 'completed' {
  if (status === 'completed' || status === 'in_progress' || status === 'pending') return status
  return 'pending'
}
