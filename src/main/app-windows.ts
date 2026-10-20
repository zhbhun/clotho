import { randomUUID } from 'node:crypto'

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
  type StoredWindowState,
  type WindowDisplay,
  type WindowsState,
  fitStoredWindow,
  focusedWindowEntries,
  newFocusedWindowState,
  resolveMainWindowState,
  sanitizeWindowsState,
  windowUiStateOf,
  withWindowEntry,
  withWindowProject,
  withWindowUiState,
  withoutWindowEntry,
} from './window-state'
import { createWindowStateTracker } from './window-state-tracker'

const MESSAGE_CHANNEL_PREFIX = 'clotho:message:'
/** How long a renderer gets to hand over a project before its stored ui is used instead. */
const DETACH_TIMEOUT_MS = 3_000

type WebviewMessageMap = DesktopRPC['renderer']['messages']
type WebviewMessageName = keyof WebviewMessageMap & string

export interface AppWindowsOptions {
  preloadPath: string
  appearance: AppAppearancePreferences
  target: MainViewTarget
  stateStore: ReturnType<typeof createStorageStore>
  contextMenuLabels: () => WebviewContextMenuLabels
  /** Per-window wiring that needs the raw web contents (navigation guards, ...). */
  onWindowCreated?: (window: BrowserWindow) => void
}

/**
 * Owns every BrowserWindow: creation, geometry tracking, the project-to-window
 * mapping, and the hand-over of a project's workspace between windows.
 */
export function createAppWindows(options: AppWindowsOptions) {
  const logger = getLogger('window')
  const registry = createWindowRegistry()
  const browserWindows = new Map<string, BrowserWindow>()
  const trackers = new Map<string, ReturnType<typeof createWindowStateTracker>>()
  const closingWindows = new Set<string>()
  const pendingDetaches = new Map<
    string,
    { resolve: (ui: Record<string, unknown> | null) => void; timer: ReturnType<typeof setTimeout> }
  >()
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
  const announceRegistry = () =>
    broadcast('windowRegistryChanged', { focusedProjectIds: registry.focusedProjectIds() })

  const storedWindows = () => sanitizeWindowsState(options.stateStore.get().windowsState)
  const storedUiOf = (windowId: string) => windowUiStateOf(storedWindows(), windowId)
  const transformWindows = (transform: (windowsState: WindowsState | undefined) => WindowsState) =>
    options.stateStore
      .transform((current) => ({
        ...current,
        windowsState: transform(sanitizeWindowsState(current.windowsState)),
      }))
      .catch((caught) => {
        logger.error('storage.write_failed', 'Failed to save the window state', { error: caught })
      })

  const bringToFront = (window: BrowserWindow) => {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  /** Asks the window showing a project to hand over that project's workspace. */
  const detachFrom = (window: RegisteredWindow, projectId: string) =>
    new Promise<Record<string, unknown> | null>((resolve) => {
      const requestId = randomUUID()
      const timer = setTimeout(() => {
        pendingDetaches.delete(requestId)
        logger.warning('window.detach_timeout', 'A window did not hand over a project in time', {
          context: { projectId, windowId: window.id },
        })
        resolve(null)
      }, DETACH_TIMEOUT_MS)
      pendingDetaches.set(requestId, { resolve, timer })
      send(webContentsOf(window), 'windowDetachProject', { requestId, projectId })
    })

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
      persist: (state) => transformWindows((windows) => withWindowEntry(windows, state)),
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
      if (isQuitting || closingWindows.has(entry.id) || current?.kind !== 'focused') {
        void tracker.flush()
        return
      }
      // A focused window hands its project back to the main window first.
      event.preventDefault()
      closingWindows.add(entry.id)
      void (async () => {
        const projectId = current.projectId
        const main = registry.main()
        if (projectId && main) {
          const ui = (await detachFrom(current, projectId)) ?? storedUiOf(entry.id) ?? null
          if (ui) send(webContentsOf(main), 'windowAttachProject', { projectId, ui })
        }
        await tracker.flush()
        if (!window.isDestroyed()) window.destroy()
      })()
    })
    window.on('closed', () => {
      const closed = registry.unregister(entry.id)
      browserWindows.delete(entry.id)
      trackers.delete(entry.id)
      closingWindows.delete(entry.id)
      // Focused windows are restored on the next launch only when the app
      // quit with them open; one closed by hand is gone for good.
      if (closed?.kind === 'focused' && !isQuitting) {
        void transformWindows((windows) => withoutWindowEntry(windows, entry.id))
      }
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
    /** The web contents that menu commands should reach: the focused window's, else the main one's. */
    activeWebContents: () =>
      BrowserWindow.getFocusedWindow()?.webContents ?? webContentsOf(registry.main()),
    setQuitting: () => {
      isQuitting = true
    },
    flushAll: () => Promise.all([...trackers.values()].map((tracker) => tracker.flush())),

    openMain() {
      const existing = registry.main()
      if (existing) {
        const window = browserWindows.get(existing.id)
        if (window) bringToFront(window)
        return
      }
      const { all, primary } = displays()
      createWindow(resolveMainWindowState(options.stateStore.get().windowsState, all, primary))
    },

    /** Reopens the focused windows the app quit with; entries whose project vanished are dropped. */
    restoreFocused(projectExists: (projectId: string) => boolean) {
      const { all, primary } = displays()
      for (const entry of focusedWindowEntries(storedWindows())) {
        if (
          entry.projectId &&
          projectExists(entry.projectId) &&
          !registry.focusedFor(entry.projectId)
        ) {
          createWindow(fitStoredWindow(entry, all, primary))
          continue
        }
        void transformWindows((windows) => withoutWindowEntry(windows, entry.id))
      }
    },

    async openFocused(projectId: string, ui: Record<string, unknown>, opener: WebContents) {
      const holder = registry.focusedFor(projectId)
      if (holder) {
        const window = browserWindows.get(holder.id)
        if (window) bringToFront(window)
        return { opened: false }
      }
      const { all, primary } = displays()
      const openerWindow = BrowserWindow.fromWebContents(opener)
      const from = openerWindow?.getBounds() ?? primary.workArea
      const entry = newFocusedWindowState(projectId, from, all, primary)
      // The seed must be stored before the window loads so the renderer's
      // first windowReadUiState already finds its workspace.
      await transformWindows((windows) =>
        withWindowUiState(withWindowEntry(windows, entry), entry, ui),
      )
      createWindow(entry)
      return { opened: true }
    },

    focusProject(
      projectId: string,
      session?: { sessionId: string; claudeSessionId: string | null },
    ) {
      const holder = registry.focusedFor(projectId)
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
      if (!window || window.kind !== 'focused' || !window.projectId) {
        return { outcome: 'focused-other' }
      }
      const holder = registry.focusedFor(projectId)
      if (holder && holder.id !== window.id) {
        const target = browserWindows.get(holder.id)
        if (target) bringToFront(target)
        return { outcome: 'focused-other' }
      }
      if (holder) return { outcome: 'refocused', ui: null }

      const previousProjectId = window.projectId
      const main = registry.main()
      // The main window holds every project no focused window shows, so it is
      // the only place the new project's tabs can come from.
      const uiForNew = main ? await detachFrom(main, projectId) : null
      registry.rebind(window.id, projectId)
      await transformWindows((windows) => withWindowProject(windows, window.id, projectId))
      if (main) {
        send(webContentsOf(main), 'windowAttachProject', {
          projectId: previousProjectId,
          ui: uiForCurrent,
        })
      }
      announceRegistry()
      return { outcome: 'refocused', ui: uiForNew }
    },

    resolveDetached(requestId: string, ui: Record<string, unknown> | null) {
      const pending = pendingDetaches.get(requestId)
      if (!pending) return
      clearTimeout(pending.timer)
      pendingDetaches.delete(requestId)
      pending.resolve(ui)
    },

    /** A removed project takes its focused window with it; nothing to hand back. */
    closeFocusedForProject(projectId: string) {
      const holder = registry.focusedFor(projectId)
      const window = holder ? browserWindows.get(holder.id) : undefined
      if (!holder || !window) return
      closingWindows.add(holder.id)
      window.destroy()
    },
  }
}

export type AppWindows = ReturnType<typeof createAppWindows>
