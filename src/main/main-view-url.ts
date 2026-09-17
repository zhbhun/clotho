import path from 'node:path'

export const DEV_SERVER_PORT = 3366
export const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`
/** Directory (relative to the main build output) where Electron Forge writes the renderer. */
export const BUNDLED_MAIN_VIEW_FILE = path.join('../renderer', 'main_window', 'index.html')

/**
 * How the main window should load the renderer: the Vite dev server during
 * development or the bundle written by Electron Forge for packaged builds.
 */
export type MainViewTarget =
  | { kind: 'dev-server'; url: string }
  | { kind: 'bundled'; filePath: string }

type FetchImpl = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => ReturnType<typeof fetch>

type GetMainViewTargetOptions = {
  channel: string
  /** Main process build directory (`__dirname` of the compiled entry). */
  mainDirectory: string
  useDevServer?: boolean
  devServerUrl?: string
  fetchImpl?: FetchImpl
  attempts?: number
  retryDelayMs?: number
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function bundledMainViewFile(mainDirectory: string) {
  return path.resolve(mainDirectory, BUNDLED_MAIN_VIEW_FILE)
}

export async function getMainViewTarget({
  channel,
  mainDirectory,
  useDevServer = false,
  devServerUrl = DEV_SERVER_URL,
  fetchImpl = fetch,
  attempts = 25,
  retryDelayMs = 200,
}: GetMainViewTargetOptions): Promise<MainViewTarget> {
  if (channel !== 'dev' || !useDevServer) {
    return { kind: 'bundled', filePath: bundledMainViewFile(mainDirectory) }
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(devServerUrl, { method: 'HEAD' })
      if (response.ok) {
        return { kind: 'dev-server', url: devServerUrl }
      }
    } catch {
      // Vite may still be starting while Electron launches.
    }

    if (attempt < attempts - 1) {
      await delay(retryDelayMs)
    }
  }

  return { kind: 'bundled', filePath: bundledMainViewFile(mainDirectory) }
}
