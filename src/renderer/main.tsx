import ReactDOM from 'react-dom/client'

import App from './app'
import { ErrorBoundary } from './components/error-boundary'
import { FailureEmpty } from './components/failure-empty'
import { ThemeProvider, applyAppearanceTheme } from './components/theme-provider'
import { LanguageProvider } from './i18n/language-provider'
import { appI18n, initializeAppI18n } from './i18n/runtime'
import './index.css'
import { sessionPersistence } from './pages/workbench/services/session-persistence'
import { workbenchSessionPersistence } from './pages/workbench/services/session-records'
import {
  flushAppSettings,
  initializeAppSettings,
  loadAppearancePreferences,
  loadLanguagePreference,
} from './services/app-settings'
import { installContextMenuGate } from './services/context-menu-gate'
import { installWindowTitlebarDoubleClick } from './services/desktop/window-controls'
import { getLogger, installWebviewErrorLogging, webviewLogging } from './services/logging'

installContextMenuGate({ isDev: import.meta.env.DEV })
installWebviewErrorLogging()
installWindowTitlebarDoubleClick()

const appLogger = getLogger('app')
const persistenceLogger = getLogger('persistence')

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)

function StartupFailure() {
  return (
    <FailureEmpty
      actionLabel="重新加载 / Reload"
      className="h-svh rounded-none bg-background text-foreground"
      description="应用暂时无法启动，请重新加载。 / Clotho could not start. Please reload."
      title="无法启动 Clotho / Unable to start Clotho"
      onAction={() => window.location.reload()}
    />
  )
}

async function renderApp() {
  const settings = initializeAppSettings().then(() => {
    applyAppearanceTheme(loadAppearancePreferences())
  })
  await settings
  workbenchSessionPersistence.start()
  window.addEventListener(
    'pagehide',
    () => {
      void sessionPersistence
        .flush()
        .catch((caught) =>
          persistenceLogger.warning(
            'persistence.flush_failed',
            'Failed to flush session persistence',
            { target: 'sessions', errorName: caught instanceof Error ? caught.name : 'Error' },
          ),
        )
      void flushAppSettings().catch((caught) =>
        persistenceLogger.warning(
          'persistence.flush_failed',
          'Failed to flush settings persistence',
          { target: 'settings', errorName: caught instanceof Error ? caught.name : 'Error' },
        ),
      )
      webviewLogging.flush()
    },
    { once: true },
  )
  const preference = loadLanguagePreference()
  const systemLanguages = navigator.languages?.length ? navigator.languages : [navigator.language]
  await initializeAppI18n(preference, systemLanguages)
  document.documentElement.lang = appI18n.resolvedLanguage ?? 'en'

  root.render(
    <ErrorBoundary fallback={<StartupFailure />}>
      <LanguageProvider initialPreference={preference} instance={appI18n}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>,
  )
  appLogger.info('webview.started', 'Clotho webview started')
}

void renderApp().catch((caught) => {
  appLogger.error('webview.startup_failed', 'Clotho webview failed to start', {
    error: caught,
  })
  root.render(<StartupFailure />)
})
