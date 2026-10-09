import type { DesktopRPC } from '@/shared/rpc'

/**
 * IPC bridge exposed by the Electron preload script (see `src/preload/index.ts`).
 * Requests are answered with `ipcRenderer.invoke`, push messages arrive via
 * `ipcRenderer.on` and log batches are sent fire-and-forget with `ipcRenderer.send`.
 */
export interface DesktopBridge {
  invoke(method: string, params: unknown): Promise<unknown>
  send(method: string, payload: unknown): void
  onPushMessage(name: string, handler: (payload: unknown) => void): () => void
}

declare global {
  interface Window {
    clotho?: DesktopBridge
  }
}

type DesktopRequestMap = DesktopRPC['main']['requests']
type DesktopRequestName = keyof DesktopRequestMap & string
type DesktopRequestParams<K extends DesktopRequestName> = DesktopRequestMap[K]['params']
type DesktopRequestResponse<K extends DesktopRequestName> = DesktopRequestMap[K]['response']
type DesktopMessageToBunMap = DesktopRPC['main']['messages']
type DesktopMessageToBunName = keyof DesktopMessageToBunMap & string
type DesktopMessageMap = DesktopRPC['renderer']['messages']

type DesktopEventMap = {
  'claude-output': DesktopMessageMap['claudeOutput']
  'claude-error': DesktopMessageMap['claudeError']
  'claude-complete': DesktopMessageMap['claudeComplete']
  'claude-tool-request': DesktopMessageMap['claudeToolRequest']
  'claude-session-recycled': DesktopMessageMap['claudeSessionRecycled']
  'menu-command-dispatch': DesktopMessageMap['menuCommandDispatch']
  'menu-open-settings': DesktopMessageMap['menuOpenSettings']
}

type DesktopEventName = keyof DesktopEventMap
type DesktopEventHandler<K extends DesktopEventName> = (payload: DesktopEventMap[K]) => void

/** Push messages sent by the main process mapped to renderer event names. */
const PUSH_EVENT_BINDINGS: Array<[keyof DesktopMessageMap & string, DesktopEventName]> = [
  ['claudeOutput', 'claude-output'],
  ['claudeError', 'claude-error'],
  ['claudeComplete', 'claude-complete'],
  ['claudeToolRequest', 'claude-tool-request'],
  ['claudeSessionRecycled', 'claude-session-recycled'],
  ['menuCommandDispatch', 'menu-command-dispatch'],
  ['menuOpenSettings', 'menu-open-settings'],
]

const eventListeners: {
  [K in DesktopEventName]: Set<DesktopEventHandler<K>>
} = {
  'claude-output': new Set(),
  'claude-error': new Set(),
  'claude-complete': new Set(),
  'claude-tool-request': new Set(),
  'claude-session-recycled': new Set(),
  'menu-command-dispatch': new Set(),
  'menu-open-settings': new Set(),
}

function desktopBridge() {
  if (typeof window === 'undefined') return undefined
  return window.clotho
}

for (const [messageName, eventName] of PUSH_EVENT_BINDINGS) {
  desktopBridge()?.onPushMessage(messageName, (payload) => {
    emitDesktopEvent(eventName, payload as DesktopEventMap[typeof eventName])
  })
}

function emitDesktopEvent<K extends DesktopEventName>(eventName: K, payload: DesktopEventMap[K]) {
  for (const listener of eventListeners[eventName]) {
    listener(payload)
  }
}

export function isDesktopRuntime() {
  return desktopBridge() !== undefined
}

export async function requestFromDesktop<K extends DesktopRequestName>(
  method: K,
  params: DesktopRequestParams<K>,
): Promise<DesktopRequestResponse<K>> {
  const bridge = desktopBridge()
  if (!bridge) {
    throw new Error('The Clotho desktop bridge is unavailable')
  }

  return bridge.invoke(method, params) as Promise<DesktopRequestResponse<K>>
}

export function sendMessageToDesktop<K extends DesktopMessageToBunName>(
  method: K,
  payload: DesktopMessageToBunMap[K],
) {
  const bridge = desktopBridge()
  if (!bridge) return
  bridge.send(method, payload)
}

export async function listenDesktopEvent<K extends DesktopEventName>(
  eventName: K,
  handler: DesktopEventHandler<K>,
) {
  eventListeners[eventName].add(handler as never)

  return () => {
    eventListeners[eventName].delete(handler as never)
  }
}
