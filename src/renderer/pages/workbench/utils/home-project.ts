import type { WorkbenchProject } from '../stores/workbench-store'

/** The homedir-backed work default project owns home conversations. */
export function findHomeProjectId(projects: Record<string, WorkbenchProject>): string | null {
  return Object.values(projects).find((project) => project.is_home)?.id ?? null
}
