import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { type ClaudeRuntimeState, MIN_CLAUDE_VERSION } from '@/shared/claude-runtime'

import { discoverClaude, nativeClaudePath } from './discovery'
import { installClaude } from './installer'
import { hasClaudeProcesses } from './processes'

interface RuntimeDependencies {
  discover: typeof discoverClaude
  install: typeof installClaude
  hasProcesses: typeof hasClaudeProcesses
}

export function createClaudeRuntime(
  deps: RuntimeDependencies = {
    discover: discoverClaude,
    install: installClaude,
    hasProcesses: hasClaudeProcesses,
  },
) {
  let state: ClaudeRuntimeState = {
    phase: 'checking',
    minimumVersion: MIN_CLAUDE_VERSION,
    customPath: '',
    installPath: nativeClaudePath(),
    logs: '',
  }
  let probe: Promise<ClaudeRuntimeState> | undefined
  let selection: Promise<unknown> = Promise.resolve()
  let task: Promise<void> | undefined
  let abort: AbortController | undefined
  let publish: (state: ClaudeRuntimeState) => void = () => {}
  let savePath: (path: string) => Promise<void> = async () => {}
  const snapshot = () => ({ ...state })
  function update(next: Partial<ClaudeRuntimeState>) {
    state = { ...state, ...next }
    publish(snapshot())
    return snapshot()
  }
  function detected(found: ClaudeRuntimeState) {
    // A missing installation must clear the previous executable and version.
    state = { ...found, operation: state.operation }
    publish(snapshot())
    return snapshot()
  }
  function detect() {
    if (probe) return probe
    update({ phase: 'checking', operation: undefined, error: undefined, errorCode: undefined })
    probe = deps
      .discover(state.customPath)
      .then(detected)
      .catch((caught) =>
        update({ phase: 'error', errorCode: 'detection-failed', error: String(caught) }),
      )
      .finally(() => {
        probe = undefined
      })
    return probe
  }
  return {
    configure(options: {
      customPath?: string
      publish: typeof publish
      savePath: typeof savePath
    }) {
      state.customPath = options.customPath ?? ''
      publish = options.publish
      savePath = options.savePath
    },
    get: snapshot,
    check(customPath?: string): Promise<ClaudeRuntimeState> {
      if (task) return Promise.resolve(snapshot())
      if (customPath === undefined) return selection.then(() => (task ? snapshot() : detect()))
      const result = selection.then(async () => {
        if (task) return snapshot()
        if (probe) await probe
        await savePath(customPath.trim())
        state.customPath = customPath.trim()
        return detect()
      })
      selection = result.catch(() => undefined)
      return result
    },
    async executable() {
      await selection
      if (task) throw new Error('Claude Code installation or update is in progress.')
      if (state.phase === 'ready' && state.path) {
        try {
          await access(state.path, process.platform === 'win32' ? constants.F_OK : constants.X_OK)
          return state.path
        } catch {
          /* Rediscover an installation that moved or disappeared. */
        }
      }
      const found = await detect()
      if (found.phase !== 'ready' || !found.path) {
        throw new Error(
          `Claude Code is not ready (${found.phase}). ${found.error ?? `Version ${MIN_CLAUDE_VERSION} or later is required.`}`,
        )
      }
      return found.path
    },
    invalidate(caught: unknown) {
      const code = (caught as NodeJS.ErrnoException)?.code
      if ((code === 'ENOENT' || code === 'EACCES') && !task) void detect()
    },
    async start() {
      if (task) return snapshot()
      await selection
      if (probe) await probe
      if (task || state.phase === 'ready') return snapshot()
      const isUpdate =
        state.phase === 'outdated' || (state.phase === 'failed' && state.operation === 'update')
      if (deps.hasProcesses()) {
        return update({
          phase: 'failed',
          operation: isUpdate ? 'update' : 'install',
          errorCode: 'active-processes',
          error: 'Close active Claude sessions before installing or updating.',
        })
      }
      if (state.customPath && !isUpdate) {
        return update({
          phase: 'failed',
          errorCode: 'custom-path',
          error: 'Clear the custom path before installing Claude Code.',
        })
      }
      if (isUpdate && state.source !== 'native') {
        return update({
          phase: 'outdated',
          errorCode: 'manual-update',
          error:
            'Update this installation using its package manager or the official guide, then check again.',
        })
      }
      abort = new AbortController()
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(10 * 60_000)])
      const executable = isUpdate ? state.path : undefined
      update({
        phase: 'preparing',
        operation: isUpdate ? 'update' : 'install',
        logs: '',
        error: undefined,
        errorCode: undefined,
      })
      task = (async () => {
        try {
          await deps.install({
            signal,
            executable,
            onDownload: () => {
              update({ phase: 'downloading' })
            },
            onOutput: (text) => {
              update({
                logs: stripVTControlCharacters(state.logs + text).slice(-32_768),
              })
            },
          })
          update({ phase: 'verifying' })
          const found = await deps.discover(state.customPath)
          const directory = path.dirname(found.path ?? nativeClaudePath())
          if (!(process.env.PATH ?? '').split(path.delimiter).includes(directory)) {
            process.env.PATH = [directory, process.env.PATH].filter(Boolean).join(path.delimiter)
          }
          const logs = state.logs
          detected(found)
          if (found.phase !== 'ready') {
            update({
              phase: 'failed',
              logs,
              errorCode: found.errorCode ?? 'verification-failed',
              error:
                found.error ??
                'The installer finished, but no compatible Claude Code executable was found.',
            })
          } else update({ logs })
        } catch (caught) {
          update({
            phase: 'failed',
            errorCode: 'install-failed',
            error: caught instanceof Error ? caught.message : String(caught),
          })
        } finally {
          abort = undefined
          task = undefined
        }
      })()
      return snapshot()
    },
    async stop() {
      abort?.abort()
      await task
    },
  }
}

export const claudeRuntime = createClaudeRuntime()
