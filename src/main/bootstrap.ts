import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { BrowserWindow, Menu, app, ipcMain, shell } from 'electron'
import type { WebContents } from 'electron'

import { commandCatalog } from '@/shared/command-catalog'
import type { AppLogChannel } from '@/shared/logging'
import type { AppLanguage, DesktopRPC } from '@/shared/rpc'
import type { CommandId } from '@/shared/shortcuts'

import { clothoDir } from './app-data'
import { createAppWindows } from './app-windows'
import { type ApplicationWindowItem, applicationMenuItems } from './application-menu'
import { createClaudeDesktopService } from './claude-service'
import { loadAttachmentFiles } from './claude/attachments'
import { createModelProxy } from './claude/model-proxy'
import { ensureWorkProject } from './claude/projects'
import { projectIdFromPath } from './claude/sessions'
import { createSettingsStore, defaultSettings, readSettings } from './claude/settings'
import { attachExternalNavigation } from './external-navigation'
import { createFatalErrorHandler, installGlobalErrorHandlers } from './logging/global-errors'
import { wrapRequestHandlers } from './logging/rpc'
import {
  getLogger,
  initializeLogging,
  recordWebviewLogBatch,
  shutdownLogging,
} from './logging/runtime'
import { DEV_SERVER_URL, getMainViewTarget } from './main-view-url'
import { menuLabels } from './menu-labels'
import { applyNativeAppearance } from './native-appearance'
import { openLink } from './open-link'
import { saveImage } from './save-image'
import { createSessionStorage } from './session-storage'
import { createShortcutStore, readShortcutOverrides } from './shortcuts'
import { createStorageStore, readStorage } from './storage'
import { openTaskManager } from './task-manager'
import { toggleMainWindowMaximize } from './window-options'
import { sanitizeWindowsState, windowUiStateOf, withWindowUiState } from './window-state'

const REQUEST_CHANNEL_PREFIX = 'clotho:request:'
const MESSAGE_CHANNEL_PREFIX = 'clotho:message:'

type DesktopRequestMap = DesktopRPC['main']['requests']
type DesktopRequestName = keyof DesktopRequestMap & string
type DesktopRequestHandler<K extends DesktopRequestName> = (
  params: DesktopRequestMap[K]['params'],
  sender: WebContents,
) => DesktopRequestMap[K]['response'] | Promise<DesktopRequestMap[K]['response']>
type MainRequestHandlers = { [K in DesktopRequestName]: DesktopRequestHandler<K> }

function appChannel(value: string): AppLogChannel {
  if (value === 'stable' || value === 'canary') return value
  return 'dev'
}

/** Packaged builds run on the stable channel unless overridden, dev runs as dev. */
function resolveAppChannel() {
  return app.isPackaged ? appChannel(process.env.CLOTHO_CHANNEL ?? 'stable') : appChannel('dev')
}

export async function bootstrap() {
  const appLogger = getLogger('app')
  const handleFatalError = createFatalErrorHandler({
    exit: (code) => app.exit(code),
    fatal: (event, message, caught) =>
      appLogger.fatal(event, message, {
        error: caught,
      }),
    flush: shutdownLogging,
    timeoutMs: 1_000,
  })
  installGlobalErrorHandlers(handleFatalError)

  try {
    const channel = resolveAppChannel()
    await initializeLogging({
      appVersion: app.getVersion(),
      channel,
      homeDir: os.homedir(),
      runId: randomUUID(),
    })
    const modelProxyLogger = getLogger('model-proxy')
    const rpcLogger = getLogger('rpc')

    appLogger.info('app.starting', 'Clotho application is starting', {
      architecture: process.arch,
      platform: process.platform,
    })
    // The Forge Vite plugin injects the dev-server URL as a compile-time
    // constant; packaged builds leave it undefined and load the bundled view.
    const devServerUrl =
      typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string'
        ? MAIN_WINDOW_VITE_DEV_SERVER_URL
        : undefined
    const isDev = devServerUrl !== undefined
    let menuLanguage: AppLanguage = 'en'

    let loadedStorage
    try {
      loadedStorage = await readStorage()
    } catch (caught) {
      loadedStorage = {}
      appLogger.warning('storage.read_failed', 'Failed to read recoverable application storage', {
        errorName: caught instanceof Error ? caught.name : 'Error',
      })
    }
    const stateStore = createStorageStore(loadedStorage)
    // The homedir-backed work project owns home-mode conversations; make sure
    // it is registered before anything reads projects or session ownership.
    await ensureWorkProject()
    const sessionStorage = createSessionStorage(
      path.join(clothoDir(), 'sessions'),
      projectIdFromPath(os.homedir()),
    )

    const target = await getMainViewTarget({
      channel,
      mainDirectory: __dirname,
      useDevServer: isDev,
      devServerUrl: devServerUrl ?? DEV_SERVER_URL,
    })
    if (target.kind === 'dev-server') {
      appLogger.debug('app.hmr_enabled', 'Clotho is using the Vite development server')
    }

    let loadedSettings
    let recoverSettings: (() => ReturnType<typeof readSettings>) | undefined
    try {
      loadedSettings = await readSettings()
    } catch {
      loadedSettings = defaultSettings()
      recoverSettings = readSettings
    }
    const settingsStore = createSettingsStore(loadedSettings, undefined, recoverSettings)
    applyNativeAppearance(loadedSettings.appearance.theme)
    const shortcutStore = createShortcutStore(await readShortcutOverrides())

    const TROUBLESHOOTING_URL = 'https://github.com/zhbhun/clotho/issues'
    let isMenuCaptureActive = false

    const appWindows = createAppWindows({
      preloadPath: path.join(__dirname, 'preload.js'),
      appearance: loadedSettings.appearance,
      target,
      stateStore,
      contextMenuLabels: () => menuLabels(menuLanguage),
      onWindowCreated: (window) => {
        attachExternalNavigation(window.webContents, target, (url) => {
          shell.openExternal(url).catch((caught) => {
            appLogger.error('external_open.failed', 'Failed to open an external link', {
              error: caught,
              context: { url },
            })
          })
        })
      },
      onWindowsChanged: () => rebuildApplicationMenu(),
      // A closed window's session views die with it; its holds on warm queries go too.
      onWindowClosed: (windowId) => service.sessionDropWindow(windowId),
    })
    const sendToActiveWindow = <K extends keyof DesktopRPC['renderer']['messages'] & string>(
      name: K,
      payload: DesktopRPC['renderer']['messages'][K],
    ) => appWindows.send(appWindows.activeWebContents(), name, payload)

    const resolveCommandBindings = (commandId: CommandId) => {
      const overrides = shortcutStore.get()[commandId]
      return overrides && overrides.length > 0
        ? overrides
        : (commandCatalog[commandId]?.defaultBindings ?? [])
    }
    /** Window-menu entries for every open window, labelled by the project each one shows. */
    const resolveWindows = async (): Promise<ApplicationWindowItem[]> => {
      const windows = appWindows.windows()
      const projectWindows = windows.filter((window) => window.kind === 'project')
      const projects =
        projectWindows.length === 0 ? [] : await service.listProjects().catch(() => [])
      let freeIndex = 0
      return windows.map((window) => {
        const project = window.projectId
          ? projects.find((item) => item.id === window.projectId)
          : undefined
        // Before a window's renderer has loaded, its title is still the bare
        // app name; the strip only helps once the project title landed.
        const fromTitle = window.title.replace(/ — Clotho$/, '')
        const label = project
          ? project.name?.trim() || path.basename(project.path)
          : window.kind === 'project'
            ? fromTitle === window.title
              ? '…'
              : fromTitle
            : `Clotho ${++freeIndex}`
        return {
          id: window.id,
          label,
          isActive: window.isFocused,
          show: () => appWindows.showWindow(window.id),
        }
      })
    }
    let menuRebuildSeq = 0
    const rebuildApplicationMenu = () => {
      const seq = ++menuRebuildSeq
      void resolveWindows()
        .catch(() => [])
        .then((windows) => {
          if (seq !== menuRebuildSeq) return
          Menu.setApplicationMenu(
            Menu.buildFromTemplate(
              applicationMenuItems({
                language: menuLanguage,
                isDev,
                isCaptureActive: isMenuCaptureActive,
                commandBindings: resolveCommandBindings,
                windows,
                actions: {
                  dispatchCommand: (commandId) => {
                    sendToActiveWindow('menuCommandDispatch', { commandId })
                  },
                  openShortcutSettings: () => {
                    sendToActiveWindow('menuOpenSettings', { category: 'shortcuts' })
                  },
                  openTroubleshooting: () => {
                    void shell.openExternal(TROUBLESHOOTING_URL)
                  },
                  openTaskManager: () => openTaskManager(),
                  openNewWindow: () => appWindows.openNewFree(),
                },
              }),
            ),
          )
        })
    }
    rebuildApplicationMenu()

    const proxySettings = settingsStore.get()
    let modelProxy
    try {
      modelProxy = await createModelProxy({ providers: proxySettings.providers })
    } catch (caught) {
      modelProxyLogger.error('model_proxy.failed', 'The local model proxy failed to start', {
        error: caught,
      })
      throw caught
    }
    modelProxyLogger.info('model_proxy.started', 'The local model proxy started')

    const service = createClaudeDesktopService(
      {
        // Every window gets every stream event; a renderer only acts on the
        // streams it owns, so the ones it does not know about are dropped.
        onOutput(streamId, message) {
          appWindows.broadcast('claudeOutput', { streamId, message })
        },
        onError(streamId, message, stack) {
          appWindows.broadcast('claudeError', {
            streamId,
            message,
            ...(stack ? { stack } : {}),
          })
        },
        onComplete(streamId, success) {
          appWindows.broadcast('claudeComplete', { streamId, success })
        },
        onToolRequest(streamId, request) {
          appWindows.broadcast('claudeToolRequest', { streamId, request })
        },
      },
      modelProxy,
      settingsStore,
      {
        sessionOwnership: () => sessionStorage.sessionOwnership(),
        sessionRebindProject: (ids) => sessionStorage.sessionRebindProject(ids),
        sessionSetArchived: (params) => sessionStorage.sessionSetArchived(params),
        sessionSetPinned: (params) => sessionStorage.sessionSetPinned(params),
        sessionSetUnread: (params) => sessionStorage.sessionSetUnread(params),
        sessionListFlags: () => sessionStorage.sessionListFlags(),
      },
      {
        onSessionRecycled: (sessionId) => {
          appWindows.broadcast('claudeSessionRecycled', { sessionId })
        },
        onSessionRuntimeChanged: (change) => {
          appWindows.broadcast('claudeSessionRuntimeChanged', change)
        },
      },
    )

    /** Other windows reload the project catalog after one of them changed it. */
    const announceCatalogChange = (sender: WebContents) =>
      appWindows.broadcast('catalogChanged', {}, sender.id)
    const windowOf = (sender: WebContents) => appWindows.windowFor(sender)

    const requestHandlers = wrapRequestHandlers(
      {
        applicationMenuSetLanguage: ({ language }) => {
          menuLanguage = language
          rebuildApplicationMenu()
        },
        applicationMenuSetCaptureActive: ({ active }) => {
          isMenuCaptureActive = active
          rebuildApplicationMenu()
        },
        appGetPreferences: () => service.getAppPreferences(),
        appSavePreferences: async (params) => {
          const saved = await service.saveAppPreferences(params)
          applyNativeAppearance(saved.appearance.theme)
          return saved
        },
        appOpenLink: (params) =>
          openLink(params, {
            openExternal: (url) => shell.openExternal(url),
            showItemInFolder: (filePath) => shell.showItemInFolder(filePath),
            pathExists: (filePath) =>
              fs.promises.stat(filePath).then(
                () => true,
                () => false,
              ),
          }).catch((caught) => {
            appLogger.error('link_open.failed', 'Failed to open a link', {
              error: caught,
              context: { href: params.href },
            })
            return { opened: false }
          }),
        claudeStartup: (params) => service.startup(params),
        claudeQueryControl: (params) => service.controlQuery(params),
        claudeSessionQueryEnsure: (params) => service.sessionQueryEnsure(params),
        claudeSessionQueryAttach: (params) => service.sessionQueryAttach(params),
        claudeSessionViewOpened: (params, sender) => {
          const window = windowOf(sender)
          if (window) service.sessionViewOpened({ ...params, windowId: window.id })
        },
        claudeSessionViewClosed: (params, sender) => {
          const window = windowOf(sender)
          if (window) service.sessionViewClosed({ ...params, windowId: window.id })
        },
        claudeSessionQueryPush: (params) => service.sessionQueryPush(params),
        claudeSessionQueryRebuild: (params) => service.sessionQueryRebuild(params),
        claudeSessionQueryRecycleCheck: (params, sender) =>
          service.sessionQueryRecycleCheck({ ...params, windowId: windowOf(sender)?.id }),
        claudeSessionQuerySetModel: (params) => service.sessionQuerySetModel(params),
        claudeSessionQueryClose: (params) => service.sessionQueryClose(params.sessionId),
        claudeSessionPurgeDeadPairs: (params) => service.sessionPurgeDeadPairs(params),
        claudeListProjects: () => service.listProjects(),
        claudeAddProjectFromFolder: async (_params, sender) => {
          const project = await service.addProjectFromFolder()
          if (project) announceCatalogChange(sender)
          return project
        },
        claudeSelectProjectFolder: (params) => service.selectProjectFolder(params),
        claudeCreateProject: async (params, sender) => {
          const project = await service.createProject(params)
          announceCatalogChange(sender)
          return project
        },
        claudeUpdateProject: async (params, sender) => {
          const project = await service.updateProject(params)
          announceCatalogChange(sender)
          return project
        },
        claudeRemoveProject: async (params, sender) => {
          await service.removeProject(params)
          void appWindows.forgetProjectState(params.projectId)
          appWindows.closeProjectWindow(params.projectId)
          announceCatalogChange(sender)
        },
        claudeSelectFiles: (params) => service.selectFiles(params),
        claudeGetAttachmentPreview: (params) => service.getAttachmentPreview(params),
        claudeSaveImage: (params) => saveImage(params),
        claudePrepareAttachments: (params) => service.prepareAttachments(params),
        attachmentRead: (params) => loadAttachmentFiles(params),
        claudeCanSearchProjectFiles: (params) => service.canSearchProjectFiles(params),
        claudeListProjectRootEntries: (params) => service.listProjectRootEntries(params),
        claudeEnterProjectFileSearchWarmup: (params) =>
          service.enterProjectFileSearchWarmup(params),
        claudeExitProjectFileSearchWarmup: (params) => service.exitProjectFileSearchWarmup(params),
        claudeSearchProjectFiles: (params) => service.searchProjectFiles(params),
        claudeGetProjectFileOutline: (params) => service.getProjectFileOutline(params),
        claudeSetProjectLastOpened: (params) => service.setProjectLastOpened(params),
        claudeListSessions: (params) => service.listSessions(params),
        claudeSetSessionsArchived: (params) => service.setSessionsArchived(params),
        claudeSetSessionsPinned: (params) => service.setSessionsPinned(params),
        claudeSetSessionsUnread: (params) => service.setSessionsUnread(params),
        windowReadUiState: (_params, sender) => {
          const window = windowOf(sender)
          if (!window) return { ui: undefined }
          // A project window's workspace lives in projectState, not on its entry.
          if (window.kind === 'project' && window.projectId) {
            return { ui: appWindows.projectUiOf(window.projectId) }
          }
          return {
            ui: windowUiStateOf(sanitizeWindowsState(stateStore.get().windowsState), window.id),
          }
        },
        windowWriteUiState: ({ ui }, sender) => {
          const window = windowOf(sender)
          if (!window) return
          if (window.kind === 'project' && window.projectId) {
            return appWindows.persistProjectUi(window.projectId, ui).then(() => undefined)
          }
          return stateStore
            .transform((current) => ({
              ...current,
              windowsState: withWindowUiState(
                sanitizeWindowsState(current.windowsState),
                window,
                ui,
              ),
            }))
            .then(() => undefined)
        },
        windowDescribe: (_params, sender) => {
          const window = windowOf(sender)
          if (!window) throw new Error('The requesting window is not registered')
          return {
            id: window.id,
            kind: window.kind,
            projectId: window.projectId ?? null,
            pinnedProjectIds: appWindows.registry.pinnedProjectIds(),
          }
        },
        windowOpenProject: ({ projectId, ui }, sender) =>
          appWindows.openProjectWindow(projectId, ui, sender),
        windowFocusProject: ({ projectId, session }) => ({
          focused: appWindows.focusProject(projectId, session),
        }),
        windowRefocus: ({ projectId, ui }, sender) => appWindows.refocus(sender, projectId, ui),
        windowReadProjectState: ({ projectId }) => {
          const ui = appWindows.projectUiOf(projectId)
          return ui ? { ui } : null
        },
        sessionListDrafts: () => sessionStorage.sessionListDrafts(),
        sessionRead: (params) => sessionStorage.sessionRead(params),
        sessionWrite: (params) => sessionStorage.sessionWrite(params),
        sessionUpdateDraft: (params) => sessionStorage.sessionUpdateDraft(params),
        sessionCompleteDraft: (params) => sessionStorage.sessionCompleteDraft(params),
        sessionBindOwner: (params) => sessionStorage.sessionBindOwner(params),
        sessionDelete: (params) => sessionStorage.sessionDelete(params),
        sessionDeleteProject: (params) => sessionStorage.sessionDeleteProject(params),
        claudeGetSessionMessages: (params) => service.getSessionMessages(params),
        claudeGetWorkflowRuns: (params) => service.getWorkflowRuns(params),
        claudeListSubagents: (params) => service.listSubagents(params),
        claudeGetSubagentMessages: (params) => service.getSubagentMessages(params),
        claudeForkSession: (params) => service.forkSession(params),
        claudeGetSessionEditAnchor: (params) => service.getSessionEditAnchor(params),
        claudeRewindSessionFiles: (params) => service.rewindSessionFiles(params),
        claudeDropTrailingTurn: (params) => service.dropTrailingTurn(params),
        claudeSampleContextUsage: (params) => service.sampleContextUsage(params),
        claudeGetProjectGitBranch: (params) => service.getProjectGitBranch(params),
        claudeListProjectGitBranches: (params) => service.listProjectGitBranches(params),
        claudeSwitchProjectGitBranch: async (params, sender) => {
          const result = await service.switchProjectGitBranch(params)
          announceCatalogChange(sender)
          return result
        },
        claudeRenameSession: (params) => service.renameSession(params),
        claudeDeleteSession: (params) => service.deleteSession(params),
        claudeRespondToolRequest: (params) => {
          service.sessionRespondTool({
            streamId: params.streamId,
            toolUseId: params.toolUseId,
            result: params.result,
          })
        },
        claudeListProviders: () => service.listProviders(),
        claudeGetDefaultModel: () => service.getDefaultModel(),
        claudeCreateProvider: (params) => service.createProvider(params),
        claudeUpdateProvider: (params) => service.updateProvider(params),
        claudeDeleteProvider: (params) => service.deleteProvider(params),
        claudeSaveDefaultModel: (params) => service.saveDefaultModel(params),
        claudeSetProjectModel: async (params, sender) => {
          await service.setProjectModel(params)
          announceCatalogChange(sender)
        },
        claudeFetchProviderModels: (params) => service.fetchProviderModels(params),
        claudeGetProviderUsage: (params) => service.getProviderUsage(params),
        shortcutGetOverrides: () => shortcutStore.get(),
        shortcutSetOverride: (params) => {
          const overrides = shortcutStore.set(params.commandId, params.bindings)
          rebuildApplicationMenu()
          return overrides
        },
        shortcutResetOverride: (params) => {
          const overrides = shortcutStore.reset(params.commandId)
          rebuildApplicationMenu()
          return overrides
        },
        windowToggleMaximize: (_params, sender) => {
          const window = BrowserWindow.fromWebContents(sender)
          if (window) toggleMainWindowMaximize(window)
        },
      } satisfies MainRequestHandlers,
      (method, caught) => {
        if (process.env.CLOTHO_DEBUG === '1') {
          console.error(`[clotho:debug] RPC request ${method} failed:`, caught)
        }
        const error = new Error('A desktop RPC request failed')
        error.name = caught instanceof Error ? caught.name : 'Error'
        rpcLogger.error('rpc.failed', 'A desktop RPC request failed', {
          context: { method },
          error,
        })
      },
    )

    for (const [method, handler] of Object.entries(requestHandlers)) {
      ipcMain.handle(REQUEST_CHANNEL_PREFIX + method, (event, params: unknown) =>
        (handler as (requestParams: unknown, sender: WebContents) => unknown)(params, event.sender),
      )
    }
    ipcMain.on(MESSAGE_CHANNEL_PREFIX + 'appLogBatch', (_event, payload) => {
      recordWebviewLogBatch(payload)
    })

    let isStopping = false
    app.on('before-quit', (event) => {
      if (isStopping) return
      isStopping = true
      event.preventDefault()
      appWindows.setQuitting()
      appLogger.info('app.stopping', 'Clotho application is stopping')
      const stopModelProxy = modelProxy
        .stop()
        .then(() => {
          modelProxyLogger.info('model_proxy.stopped', 'The local model proxy stopped')
        })
        .catch((caught) => {
          modelProxyLogger.error('model_proxy.failed', 'The local model proxy failed to stop', {
            error: caught,
          })
        })
      const saveWindowState = appWindows.flushAll().catch((caught) => {
        appLogger.error('storage.write_failed', 'Failed to flush recoverable window state', {
          error: caught,
        })
      })
      // Resident session queries own CLI subprocesses; quitting tears them down
      // (running background tasks are killed with them by design).
      const stopSessionQueries = service.closeAllSessionQueries().catch((caught) => {
        appLogger.error('session.close_all_failed', 'Failed to close session queries', {
          error: caught,
        })
      })
      void Promise.all([stopModelProxy, saveWindowState, stopSessionQueries]).finally(async () => {
        await shutdownLogging().catch(() => undefined)
        app.exit(0)
      })
    })
    // macOS keeps the app alive without windows; the dock icon brings a free window back.
    app.on('activate', () => appWindows.openFree())

    appWindows.restoreFreeWindows()
    const projectIds = new Set((await service.listProjects()).map((project) => project.id))
    appWindows.restoreProjectWindows((projectId) => projectIds.has(projectId))

    appLogger.info('app.started', 'Clotho application started')
  } catch (caught) {
    await handleFatalError('app.startup_failed', caught)
  }
}
