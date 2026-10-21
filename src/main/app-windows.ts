import { BrowserWindow, Menu, screen } from 'electron'
import type { WebContents } from 'electron'

import type { AppAppearancePreferences, DesktopRPC, WindowRefocusResult } from '@/shared/rpc'

import { type WebviewContextMenuLabels, textEditMenuItems } from './context-menu'
import { setDialogOwnerWindow } from './dialogs'
import { getLogger } from './logging/runtime'
import type { MainViewTarget } from './main-view-url'
import type { createStorageStore } from './storage'
import { createMainWindowOptions, showMainWindowWhenReady } from './window-options'
import { type RegisteredWindow, createWindowRegistry } from './window-registry'
import {
  type ProjectWindowState,
  type StoredWindowState,
  type WindowDisplay,
  type WindowsState,
  fitStoredWindow,
  newFreeWindowState,
  newProjectWindowState,
  projectWindowEntries,
  resolveFreeWindowState,
  sanitizeProjectStates,
  sanitizeWindowsState,
  withProjectState,
  withWindowEntry,
  withWindowProject,
  withoutProjectState,
  withoutWindowEntry,
} from './window-state'
import { createWindowStateTracker } from './window-state-tracker'

const MESSAGE_CHANNEL_PREFIX = 'clotho:message:'

type WebviewMessageMap = DesktopRPC['renderer']['messages']
type WebviewMessageName = keyof WebviewMessageMap & string

/** The two persisted documents a window mutation may touch. */
type StorageDocs = {
  windowsState: WindowsState | undefined
  projectState: Record<string, ProjectWindowState>
}

export interface AppWindowsOptions {
  preloadPath: string
  appearance: AppAppearancePreferences
  target: MainViewTarget
  stateStore: ReturnType<typeof createStorageStore>
  contextMenuLabels: () => WebviewContextMenuLabels
  /** Per-window wiring that needs the raw web contents (navigation guards, ...). */
  onWindowCreated?: (window: BrowserWindow) => void
  /** The set of open windows or their focus changed; rebuilds the Window menu. */
  onWindowsChanged?: () => void
  /** A window went away; claims it held (session views) die with it. */
  onWindowClosed?: (windowId: string) => void
}

/**
 * Owns every BrowserWindow: creation, geometry tracking, the project-to-window
 * mapping, and each project's persisted workspace. A project window's tabs live
 * in projectState, so closing the window keeps them on disk for the project's
 * next opening instead of handing them back to another window.
 */
export function createAppWindows(options: AppWindowsOptions) {
  const logger = getLogger('window')
  const registry = createWindowRegistry()
  const browserWindows = new Map<string, BrowserWindow>()
  const trackers = new Map<string, ReturnType<typeof createWindowStateTracker>>()
  const closingWindows = new Set<string>()
  let isQuitting = false

  const displays = () => ({
    all: screen.getAllDisplays().map((display) => ({ ...display })) as WindowDisplay[],
    primary: { ...screen.getPrimaryDisplay(), isPrimary: true } as WindowDisplay,
  })

  const send = <K extends WebviewMessageName>(
    webContents: WebContents | undefined,
    name: K,
    payload: WebviewMessageMap[K],
  ) => {
    if (!webContents || webContents.isDestroyed()) return
    webContents.send(MESSAGE_CHANNEL_PREFIX + name, payload)
  }
  const webContentsOf = (window: RegisteredWindow | undefined) =>
    window ? browserWindows.get(window.id)?.webContents : undefined
  const broadcast = <K extends WebviewMessageName>(
    name: K,
    payload: WebviewMessageMap[K],
    except?: number,
  ) => {
    for (const window of registry.all()) {
      if (window.webContentsId === except) continue
      send(webContentsOf(window), name, payload)
    }
  }
  const announceRegistry = () => {
    options.onWindowsChanged?.()
    broadcast('windowRegistryChanged', { pinnedProjectIds: registry.pinnedProjectIds() })
  }

  const storedWindows = () => sanitizeWindowsState(options.stateStore.get().windowsState)
  const storedProjectStates = () => sanitizeProjectStates(options.stateStore.get().projectState)
  /** One queued read-modify-write over both persisted documents. */
  const transformStorage = (transform: (docs: StorageDocs) => Partial<StorageDocs>) =>
    options.stateStore
      .transform((current) => {
        const next = transform({
          windowsState: sanitizeWindowsState(current.windowsState),
          projectState: sanitizeProjectStates(current.projectState),
        })
        return {
          ...current,
          ...(next.windowsState ? { windowsState: next.windowsState } : {}),
          ...(next.projectState ? { projectState: next.projectState } : {}),
        }
      })
      .catch((caught) => {
        logger.error('storage.write_failed', 'Failed to save the window state', { error: caught })
      })
  const transformWindows = (transform: (windowsState: WindowsState | undefined) => WindowsState) =>
    transformStorage((docs) => ({ windowsState: transform(docs.windowsState) }))

  const bringToFront = (window: BrowserWindow) => {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  /** The free window that was active last, else any free window. */
  const lastActiveFree = () => {
    const lastActiveId = storedWindows()?.lastActiveWindow
    const free = registry.freeWindows()
    return free.find((window) => window.id === lastActiveId) ?? free[0]
  }

  function createWindow(entry: StoredWindowState) {
    const window = new BrowserWindow(
      createMainWindowOptions(options.preloadPath, entry.frame, options.appearance),
    )
    const registered: RegisteredWindow = {
      id: entry.id,
      kind: entry.kind,
      ...(entry.projectId ? { projectId: entry.projectId } : {}),
      webContentsId: window.webContents.id,
    }
    if (!registry.register(registered)) {
      window.destroy()
      throw new Error(`Window ${entry.id} (${entry.kind}) violates the window invariants`)
    }
    browserWindows.set(entry.id, window)

    const tracker = createWindowStateTracker({
      initialState: entry,
      persist: (state) =>
        transformStorage((docs) => ({
          windowsState: withWindowEntry(docs.windowsState, state),
          // A project window's geometry doubles as the project's reopen geometry.
          projectState:
            state.kind === 'project' && state.projectId
              ? withProjectState(docs.projectState, state.projectId, {
                  window: { frame: state.frame, isMaximized: state.isMaximized },
                })
              : docs.projectState,
        })),
      onError: (caught) => {
        logger.error('storage.write_failed', 'Failed to save the window geometry', {
          error: caught,
        })
      },
    })
    trackers.set(entry.id, tracker)
    const captureGeometry = () => {
      try {
        tracker.update({
          frame: window.getBounds(),
          isFullScreen: window.isFullScreen(),
          isMaximized: window.isMaximized(),
        })
      } catch (caught) {
        logger.warning('window_state.capture_failed', 'Failed to capture the window state', {
          errorName: caught instanceof Error ? caught.name : 'Error',
        })
      }
    }
    window.on('move', captureGeometry)
    window.on('resize', captureGeometry)
    window.on('focus', () => {
      setDialogOwnerWindow(window)
      options.onWindowsChanged?.()
      void transformWindows((windows) => ({
        ...(windows ?? { openedWindows: [] }),
        lastActiveWindow: entry.id,
      }))
    })
    // Electron never shows a default context menu (it reports every one as
    // handled), so the text-editing menu is built here; silent areas stay
    // silent, matching the renderer's context-menu gate.
    window.webContents.on('context-menu', (_event, params) => {
      const items = textEditMenuItems(params, options.contextMenuLabels())
      if (items) Menu.buildFromTemplate(items).popup({ window })
    })
    options.onWindowCreated?.(window)

    window.on('close', (event) => {
      const current = registry.byId(entry.id)
      if (isQuitting || closingWindows.has(entry.id) || current?.kind !== 'project') {
        void tracker.flush()
        return
      }
      // A project window leaves its workspace in projectState for the next
      // time the project opens; nothing is handed back to another window.
      event.preventDefault()
      closingWindows.add(entry.id)
      void (async () => {
        await tracker.flush()
        if (!window.isDestroyed()) window.destroy()
      })()
    })
    window.on('closed', () => {
      const closed = registry.unregister(entry.id)
      browserWindows.delete(entry.id)
      trackers.delete(entry.id)
      closingWindows.delete(entry.id)
      // Project windows are restored on the next launch only when the app
      // quit with them open; one closed by hand is gone for good.
      if (closed?.kind === 'project' && !isQuitting) {
        void transformWindows((windows) => withoutWindowEntry(windows, entry.id))
      }
      options.onWindowClosed?.(entry.id)
      announceRegistry()
    })

    if (options.target.kind === 'dev-server') {
      void window.loadURL(options.target.url)
    } else {
      void window.loadFile(options.target.filePath)
    }
    showMainWindowWhenReady(window, entry.isMaximized)
    announceRegistry()
    return window
  }

  return {
    registry,
    broadcast,
    send,
    windowFor: (webContents: WebContents) => registry.byWebContents(webContents.id),
    browserWindowOf: (windowId: string) => browserWindows.get(windowId),
    /** The web contents that menu commands should reach: the focused window's, else the last active free one's. */
    activeWebContents: () =>
      BrowserWindow.getFocusedWindow()?.webContents ??
      webContentsOf(lastActiveFree()) ??
      webContentsOf(registry.all()[0]),
    setQuitting: () => {
      isQuitting = true
    },
    flushAll: () => Promise.all([...trackers.values()].map((tracker) => tracker.flush())),

    /** The project window's stored ui, mirrored on every workspace write. */
    projectUiOf: (projectId: string) => storedProjectStates()[projectId]?.ui,
    /** Replaces one project's persisted workspace ui. */
    persistProjectUi(projectId: string, ui: Record<string, unknown>) {
      return transformStorage((docs) => ({
        projectState: withProjectState(docs.projectState, projectId, { ui }),
      }))
    },
    /** Drops a project's persisted workspace (project removed). */
    forgetProjectState(projectId: string) {
      return transformStorage((docs) => ({
        projectState: withoutProjectState(docs.projectState, projectId),
      }))
    },

    /** Brings the last active free window to the front, creating one when none is open. */
    openFree() {
      const existing = lastActiveFree()
      const window = existing ? browserWindows.get(existing.id) : undefined
      if (window) {
        bringToFront(window)
        return
      }
      const { all, primary } = displays()
      createWindow(resolveFreeWindowState(options.stateStore.get().windowsState, all, primary))
    },

    /** Opens another free window, cascaded from the opener or the last active one. */
    openNewFree(opener?: WebContents) {
      const { all, primary } = displays()
      const openerWindow = opener ? BrowserWindow.fromWebContents(opener) : undefined
      const active = lastActiveFree()
      const activeWindow = active ? browserWindows.get(active.id) : undefined
      const from = openerWindow?.getBounds() ?? activeWindow?.getBounds() ?? primary.workArea
      const entry = newFreeWindowState(from, all, primary)
      void transformWindows((windows) => withWindowEntry(windows, entry))
      createWindow(entry)
    },

    /** Reopens every free window the app quit with, last active last so it ends up focused. */
    restoreFreeWindows() {
      const saved = storedWindows()
      const entries = saved?.openedWindows.filter((entry) => entry.kind === 'free') ?? []
      if (entries.length === 0) {
        const { all, primary } = displays()
        createWindow(resolveFreeWindowState(options.stateStore.get().windowsState, all, primary))
        return
      }
      const lastActiveId = saved?.lastActiveWindow
      const { all, primary } = displays()
      const ordered = [
        ...entries.filter((entry) => entry.id !== lastActiveId),
        ...entries.filter((entry) => entry.id === lastActiveId),
      ]
      for (const entry of ordered) createWindow(fitStoredWindow(entry, all, primary))
    },

    /** Reopens the project windows the app quit with; entries whose project vanished are dropped. */
    restoreProjectWindows(projectExists: (projectId: string) => boolean) {
      const { all, primary } = displays()
      for (const entry of projectWindowEntries(storedWindows())) {
        if (
          entry.projectId &&
          projectExists(entry.projectId) &&
          !registry.projectFor(entry.projectId)
        ) {
          createWindow(fitStoredWindow(entry, all, primary))
          continue
        }
        void transformWindows((windows) => withoutWindowEntry(windows, entry.id))
      }
    },

    async openProjectWindow(
      projectId: string,
      ui: Record<string, unknown> | undefined,
      opener: WebContents,
    ) {
      const holder = registry.projectFor(projectId)
      if (holder) {
        const window = browserWindows.get(holder.id)
        if (window) bringToFront(window)
        return { opened: false }
      }
      const { all, primary } = displays()
      const openerWindow = BrowserWindow.fromWebContents(opener)
      const from = openerWindow?.getBounds() ?? primary.workArea
      const entry = newProjectWindowState(
        projectId,
        from,
        all,
        primary,
        storedProjectStates()[projectId]?.window,
      )
      // The seed must be stored before the window loads so the renderer's
      // first windowReadUiState already finds its workspace in projectState.
      await transformStorage((docs) => ({
        windowsState: withWindowEntry(docs.windowsState, entry),
        projectState: ui
          ? withProjectState(docs.projectState, projectId, { ui })
          : docs.projectState,
      }))
      createWindow(entry)
      return { opened: true }
    },

    focusProject(
      projectId: string,
      session?: { sessionId: string; claudeSessionId: string | null },
    ) {
      const holder = registry.projectFor(projectId)
      const window = holder ? browserWindows.get(holder.id) : undefined
      if (!window) return false
      bringToFront(window)
      if (session) send(window.webContents, 'windowSelectSession', session)
      return true
    },

    async refocus(
      requester: WebContents,
      projectId: string,
      uiForCurrent: Record<string, unknown>,
    ): Promise<WindowRefocusResult> {
      const window = registry.byWebContents(requester.id)
      if (!window || window.kind !== 'project' || !window.projectId) {
        return { outcome: 'shown-elsewhere' }
      }
      const holder = registry.projectFor(projectId)
      if (holder && holder.id !== window.id) {
        const target = browserWindows.get(holder.id)
        if (target) bringToFront(target)
        return { outcome: 'shown-elsewhere' }
      }
      if (holder) return { outcome: 'refocused', ui: null }

      const previousProjectId = window.projectId
      // Both sides of the switch live in projectState: the old project keeps
      // the caller's workspace, the new one yields its persisted tabs.
      const uiForNew = storedProjectStates()[projectId]?.ui ?? null
      registry.rebind(window.id, projectId)
      await transformStorage((docs) => ({
        windowsState: withWindowProject(docs.windowsState, window.id, projectId),
        projectState: withProjectState(docs.projectState, previousProjectId, {
          ui: uiForCurrent,
        }),
      }))
      announceRegistry()
      return { outcome: 'refocused', ui: uiForNew }
    },

    /** A removed project takes its project window and persisted state with it. */
    closeProjectWindow(projectId: string) {
      const holder = registry.projectFor(projectId)
      void transformStorage((docs) => ({
        projectState: withoutProjectState(docs.projectState, projectId),
      }))
      const window = holder ? browserWindows.get(holder.id) : undefined
      if (!holder || !window) return
      closingWindows.add(holder.id)
      window.destroy()
    },

    /** Every open window, for the Window menu list. */
    windows() {
      return registry.all().map((entry) => {
        const window = browserWindows.get(entry.id)
        return {
          id: entry.id,
          kind: entry.kind,
          projectId: entry.projectId ?? null,
          isFocused: window?.isFocused() ?? false,
          title: window?.getTitle() ?? '',
        }
      })
    },

    showWindow(windowId: string) {
      const window = browserWindows.get(windowId)
      if (window) bringToFront(window)
    },
  }
}

export type AppWindows = ReturnType<typeof createAppWindows>
