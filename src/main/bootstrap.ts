import { randomUUID } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

import { BrowserWindow, Menu, app, ipcMain, screen } from 'electron'
import type { WebContents } from 'electron'

import type { AppLogChannel } from '@/shared/logging'
import type { DesktopRPC } from '@/shared/rpc'

import { clothoDir } from './app-data'
import { applicationMenuItems } from './application-menu'
import { createClaudeDesktopService } from './claude-service'
import { loadAttachmentFiles } from './claude/attachments'
import { createModelProxy } from './claude/model-proxy'
import { createSessionFollowManager } from './claude/session-follow-manager'
import { createSettingsStore, defaultSettings, readSettings } from './claude/settings'
import { setDialogOwnerWindow } from './dialogs'
import { createFatalErrorHandler, installGlobalErrorHandlers } from './logging/global-errors'
import { wrapRequestHandlers } from './logging/rpc'
import {
  getLogger,
  initializeLogging,
  recordWebviewLogBatch,
  shutdownLogging,
} from './logging/runtime'
import { DEV_SERVER_URL, getMainViewTarget } from './main-view-url'
import { applyNativeAppearance } from './native-appearance'
import { createSessionStorage } from './session-storage'
import { createShortcutStore, readShortcutOverrides } from './shortcuts'
import { createStateStore, readState } from './state'
import {
  createMainWindowOptions,
  showMainWindowWhenReady,
  toggleMainWindowMaximize,
} from './window-options'
import { createWindowState, resolveWindowState } from './window-state'
import { createWindowStateTracker } from './window-state-tracker'

const REQUEST_CHANNEL_PREFIX = 'clotho:request:'
const MESSAGE_CHANNEL_PREFIX = 'clotho:message:'

type DesktopRequestMap = DesktopRPC['main']['requests']
type DesktopRequestName = keyof DesktopRequestMap & string
type DesktopRequestHandler<K extends DesktopRequestName> = (
  params: DesktopRequestMap[K]['params'],
) => DesktopRequestMap[K]['response'] | Promise<DesktopRequestMap[K]['response']>
type MainRequestHandlers = { [K in DesktopRequestName]: DesktopRequestHandler<K> }

type WebviewMessageMap = DesktopRPC['renderer']['messages']
type WebviewMessageName = keyof WebviewMessageMap & string

function appChannel(value: string): AppLogChannel {
  if (value === 'stable' || value === 'canary') return value
  return 'dev'
}

/** Packaged builds run on the stable channel unless overridden, dev runs as dev. */
function resolveAppChannel() {
  return app.isPackaged ? appChannel(process.env.CLOTHO_CHANNEL ?? 'stable') : appChannel('dev')
}

function sendToMainView<K extends WebviewMessageName>(
  webview: WebContents | undefined,
  name: K,
  payload: WebviewMessageMap[K],
) {
  webview?.send(MESSAGE_CHANNEL_PREFIX + name, payload)
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
    Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuItems('en', isDev)))

    let loadedState
    try {
      loadedState = await readState()
    } catch (caught) {
      loadedState = {}
      appLogger.warning('state.read_failed', 'Failed to read recoverable application state', {
        errorName: caught instanceof Error ? caught.name : 'Error',
      })
    }
    const stateStore = createStateStore(loadedState)
    const sessionStorage = createSessionStorage(path.join(clothoDir(), 'sessions'))

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
    const proxySettings = settingsStore.get()
    let modelProxy
    try {
      modelProxy = await createModelProxy({
        providers: proxySettings.providers,
        models: proxySettings.models,
      })
    } catch (caught) {
      modelProxyLogger.error('model_proxy.failed', 'The local model proxy failed to start', {
        error: caught,
      })
      throw caught
    }
    modelProxyLogger.info('model_proxy.started', 'The local model proxy started')

    const displays = screen.getAllDisplays().map((display) => ({ ...display }))
    const primaryDisplay = { ...screen.getPrimaryDisplay(), isPrimary: true }
    const initialWindowState = resolveWindowState(loadedState.window, displays, primaryDisplay)
    const mainWindow = new BrowserWindow(
      createMainWindowOptions(
        path.join(__dirname, 'preload.js'),
        initialWindowState.frame,
        loadedSettings.appearance,
      ),
    )
    const mainWindowWebview = mainWindow.webContents
    setDialogOwnerWindow(mainWindow)

    const service = createClaudeDesktopService(
      {
        onOutput(streamId, message) {
          sendToMainView(mainWindowWebview, 'claudeOutput', { streamId, message })
        },
        onError(streamId, message, stack) {
          sendToMainView(mainWindowWebview, 'claudeError', {
            streamId,
            message,
            ...(stack ? { stack } : {}),
          })
        },
        onComplete(streamId, success) {
          sendToMainView(mainWindowWebview, 'claudeComplete', { streamId, success })
        },
        onToolRequest(streamId, request) {
          sendToMainView(mainWindowWebview, 'claudeToolRequest', { streamId, request })
        },
      },
      modelProxy,
      settingsStore,
    )

    const followManager = createSessionFollowManager({
      onUpdate(sessionId, lines) {
        sendToMainView(mainWindowWebview, 'claudeFollowUpdate', { sessionId, lines })
      },
      onState(sessionId, state) {
        sendToMainView(mainWindowWebview, 'claudeFollowState', { sessionId, state })
      },
      onReset(sessionId) {
        sendToMainView(mainWindowWebview, 'claudeFollowReset', { sessionId })
      },
    })

    const requestHandlers = wrapRequestHandlers(
      {
        applicationMenuSetLanguage: ({ language }) => {
          Menu.setApplicationMenu(Menu.buildFromTemplate(applicationMenuItems(language, isDev)))
        },
        appGetPreferences: () => service.getAppPreferences(),
        appSavePreferences: async (params) => {
          const saved = await service.saveAppPreferences(params)
          applyNativeAppearance(saved.appearance.theme)
          return saved
        },
        claudeStartup: (params) => service.startup(params),
        claudeQueryStart: (params) => service.startQuery(params),
        claudeQueryControl: (params) => service.controlQuery(params),
        claudeQueryClose: (params) => service.closeQuery(params.streamId),
        claudeQueryStreamInputStart: (params) => service.startQueryInputStream(params),
        claudeQueryStreamInputMessage: (params) => service.pushQueryInputMessage(params),
        claudeQueryStreamInputComplete: (params) => service.completeQueryInputStream(params),
        claudeQueryStreamInputError: (params) => service.failQueryInputStream(params),
        claudeListProjects: () => service.listProjects(),
        claudeAddProjectFromFolder: () => service.addProjectFromFolder(),
        claudeSelectProjectFolder: (params) => service.selectProjectFolder(params),
        claudeCreateProject: (params) => service.createProject(params),
        claudeUpdateProject: (params) => service.updateProject(params),
        claudeRemoveProject: (params) => service.removeProject(params),
        claudeSelectFiles: (params) => service.selectFiles(params),
        claudeGetAttachmentPreview: (params) => service.getAttachmentPreview(params),
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
        sessionListDrafts: () => sessionStorage.sessionListDrafts(),
        sessionRead: (params) => sessionStorage.sessionRead(params),
        sessionWrite: (params) => sessionStorage.sessionWrite(params),
        sessionUpdateDraft: (params) => sessionStorage.sessionUpdateDraft(params),
        sessionCompleteDraft: (params) => sessionStorage.sessionCompleteDraft(params),
        sessionDelete: (params) => sessionStorage.sessionDelete(params),
        sessionDeleteProject: (params) => sessionStorage.sessionDeleteProject(params),
        claudeGetSessionMessages: (params) => service.getSessionMessages(params),
        claudeGetWorkflowRuns: (params) => service.getWorkflowRuns(params),
        claudeListSubagents: (params) => service.listSubagents(params),
        claudeGetSubagentMessages: (params) => service.getSubagentMessages(params),
        claudeForkSession: (params) => service.forkSession(params),
        claudeGetSessionEditAnchor: (params) => service.getSessionEditAnchor(params),
        claudeRewindSessionFiles: (params) => service.rewindSessionFiles(params),
        claudeDropTrailingTurn: async (params) => {
          const result = await service.dropTrailingTurn(params)
          if (params.sessionId && (result.dropped || result.removedSession)) {
            followManager.reset(params.sessionId)
          }
          return result
        },
        claudeSampleContextUsage: (params) => service.sampleContextUsage(params),
        claudeGetProjectGitBranch: (params) => service.getProjectGitBranch(params),
        claudeRenameSession: (params) => service.renameSession(params),
        claudeDeleteSession: (params) => service.deleteSession(params),
        claudeRespondToolRequest: (params) =>
          service.respondToolRequest(params.streamId, params.toolUseId, params.result),
        claudeListProviders: () => service.listProviders(),
        claudeListModelMappings: () => service.listModelMappings(),
        claudeCreateProvider: (params) => service.createProvider(params),
        claudeUpdateProvider: (params) => service.updateProvider(params),
        claudeDeleteProvider: (params) => service.deleteProvider(params),
        claudeSaveModelMappings: (params) => service.saveModelMappings(params),
        claudeSetProjectModel: (params) => service.setProjectModel(params),
        claudeFetchProviderModels: (params) => service.fetchProviderModels(params),
        claudeGetProviderUsage: (params) => service.getProviderUsage(params),
        claudeFollowStart: (params) => followManager.start(params.projectId, params.sessionId),
        claudeFollowStop: (params) => followManager.stop(params.sessionId),
        shortcutGetOverrides: () => shortcutStore.get(),
        shortcutSetOverride: (params) => shortcutStore.set(params.commandId, params.bindings),
        shortcutResetOverride: (params) => shortcutStore.reset(params.commandId),
        windowToggleMaximize: () => {
          toggleMainWindowMaximize(mainWindow)
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
      ipcMain.handle(REQUEST_CHANNEL_PREFIX + method, (_event, params: unknown) =>
        (handler as (requestParams: unknown) => unknown)(params),
      )
    }
    ipcMain.on(MESSAGE_CHANNEL_PREFIX + 'appLogBatch', (_event, payload) => {
      recordWebviewLogBatch(payload)
    })

    const windowStateTracker = createWindowStateTracker({
      initialState: createWindowState(
        initialWindowState.frame,
        displays,
        primaryDisplay,
        initialWindowState.isMaximized,
      ),
      getDisplays: () => screen.getAllDisplays().map((display) => ({ ...display })),
      getPrimaryDisplay: () => ({ ...screen.getPrimaryDisplay(), isPrimary: true }),
      persist: (window) => stateStore.update({ window }),
      onError: (caught) => {
        appLogger.error('state.write_failed', 'Failed to save recoverable window state', {
          error: caught,
        })
      },
    })
    const captureWindowState = () => {
      try {
        windowStateTracker.update({
          frame: mainWindow.getBounds(),
          isFullScreen: mainWindow.isFullScreen(),
          isMaximized: mainWindow.isMaximized(),
        })
      } catch (caught) {
        appLogger.warning('window_state.capture_failed', 'Failed to capture the window state', {
          errorName: caught instanceof Error ? caught.name : 'Error',
        })
      }
    }
    mainWindow.on('move', captureWindowState)
    mainWindow.on('resize', captureWindowState)
    showMainWindowWhenReady(mainWindow, initialWindowState.isMaximized)

    let isStopping = false
    mainWindow.on('close', (event) => {
      if (isStopping) return
      isStopping = true
      event.preventDefault()
      appLogger.info('app.stopping', 'Clotho application is stopping')
      followManager.stopAll()
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
      const saveWindowState = windowStateTracker.flush().catch((caught) => {
        appLogger.error('state.write_failed', 'Failed to flush recoverable window state', {
          error: caught,
        })
      })
      void Promise.all([stopModelProxy, saveWindowState]).finally(async () => {
        await shutdownLogging().catch(() => undefined)
        app.exit(0)
      })
    })

    if (target.kind === 'dev-server') {
      await mainWindow.loadURL(target.url)
    } else {
      await mainWindow.loadFile(target.filePath)
    }

    appLogger.info('app.started', 'Clotho application started')
  } catch (caught) {
    await handleFatalError('app.startup_failed', caught)
  }
}
