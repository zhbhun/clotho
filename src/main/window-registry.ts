import type { WindowIdentity } from './window-state'

export interface RegisteredWindow extends WindowIdentity {
  webContentsId: number
}

/**
 * Which windows are open and what each one shows. Enforces the two window
 * invariants: a single main window, and at most one focused window per project.
 */
export function createWindowRegistry() {
  const windows = new Map<string, RegisteredWindow>()

  const main = () => [...windows.values()].find((window) => window.kind === 'main')
  const focusedFor = (projectId: string) =>
    [...windows.values()].find(
      (window) => window.kind === 'focused' && window.projectId === projectId,
    )

  return {
    main,
    focusedFor,
    all: () => [...windows.values()],
    focusedWindows: () => [...windows.values()].filter((window) => window.kind === 'focused'),
    focusedProjectIds: () =>
      [...windows.values()].flatMap((window) =>
        window.kind === 'focused' && window.projectId ? [window.projectId] : [],
      ),
    byId: (id: string) => windows.get(id),
    byWebContents: (webContentsId: number) =>
      [...windows.values()].find((window) => window.webContentsId === webContentsId),
    /** False when the window would break an invariant; nothing is registered then. */
    register(window: RegisteredWindow): boolean {
      if (windows.has(window.id)) return false
      if (window.kind === 'main' && main()) return false
      if (window.kind === 'focused' && (!window.projectId || focusedFor(window.projectId))) {
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
    /** Points a focused window at another project; false when that project is taken. */
    rebind(id: string, projectId: string): boolean {
      const window = windows.get(id)
      if (!window || window.kind !== 'focused') return false
      const holder = focusedFor(projectId)
      if (holder && holder.id !== id) return false
      windows.set(id, { ...window, projectId })
      return true
    },
  }
}

export type WindowRegistry = ReturnType<typeof createWindowRegistry>
