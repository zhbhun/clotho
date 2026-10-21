import type { WindowIdentity } from './window-state'

export interface RegisteredWindow extends WindowIdentity {
  webContentsId: number
}

/**
 * Which windows are open and what each one shows. Enforces the window
 * invariant: at most one project window per project; free windows are unlimited.
 */
export function createWindowRegistry() {
  const windows = new Map<string, RegisteredWindow>()

  const freeWindows = () => [...windows.values()].filter((window) => window.kind === 'free')
  const projectFor = (projectId: string) =>
    [...windows.values()].find(
      (window) => window.kind === 'project' && window.projectId === projectId,
    )

  return {
    freeWindows,
    projectFor,
    all: () => [...windows.values()],
    projectWindows: () => [...windows.values()].filter((window) => window.kind === 'project'),
    pinnedProjectIds: () =>
      [...windows.values()].flatMap((window) =>
        window.kind === 'project' && window.projectId ? [window.projectId] : [],
      ),
    byId: (id: string) => windows.get(id),
    byWebContents: (webContentsId: number) =>
      [...windows.values()].find((window) => window.webContentsId === webContentsId),
    /** False when the window would break an invariant; nothing is registered then. */
    register(window: RegisteredWindow): boolean {
      if (windows.has(window.id)) return false
      if (window.kind === 'project' && (!window.projectId || projectFor(window.projectId))) {
        return false
      }
      windows.set(window.id, { ...window })
      return true
    },
    unregister(id: string) {
      const window = windows.get(id)
      windows.delete(id)
      return window
    },
    /** Points a project window at another project; false when that project is taken. */
    rebind(id: string, projectId: string): boolean {
      const window = windows.get(id)
      if (!window || window.kind !== 'project') return false
      const holder = projectFor(projectId)
      if (holder && holder.id !== id) return false
      windows.set(id, { ...window, projectId })
      return true
    },
  }
}

export type WindowRegistry = ReturnType<typeof createWindowRegistry>
