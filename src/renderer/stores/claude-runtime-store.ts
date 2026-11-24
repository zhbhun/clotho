import { create } from 'zustand'

import type { ClaudeRuntimeState } from '@/shared/claude-runtime'

import { listenDesktopEvent, requestFromDesktop } from '../services/desktop/client'
import { enableRuntimePreview } from './claude-runtime-preview'

export function isClaudeRuntimeBusy(phase: ClaudeRuntimeState['phase']) {
  return phase === 'preparing' || phase === 'downloading' || phase === 'verifying'
}

interface RuntimeStore {
  runtime: ClaudeRuntimeState | null
  isInitializing: boolean
  hasContinued: boolean
  generation: number
  requestError: string | null
  initialize: (options?: { autoContinue?: boolean }) => Promise<void>
  check: (customPath?: string) => Promise<void>
  install: () => Promise<void>
  continue: () => void
}

export function createClaudeRuntimeStore() {
  let initialization: Promise<void> | undefined
  return create<RuntimeStore>((set, get) => {
    function receive(runtime: ClaudeRuntimeState) {
      set((state) => ({
        runtime,
        requestError: null,
        generation:
          state.generation +
          (runtime.phase === 'ready' && state.runtime?.phase !== 'ready' ? 1 : 0),
        hasContinued:
          runtime.phase === 'ready' || runtime.phase === 'checking' ? state.hasContinued : false,
      }))
    }
    async function request(
      method: 'claudeRuntimeCheck' | 'claudeRuntimeInstall',
      customPath?: string,
    ) {
      set({ requestError: null })
      try {
        receive(await requestFromDesktop(method, customPath === undefined ? {} : { customPath }))
      } catch (caught) {
        set({ requestError: caught instanceof Error ? caught.message : String(caught) })
      }
    }
    return {
      runtime: null,
      isInitializing: true,
      hasContinued: false,
      generation: 0,
      requestError: null,
      initialize({ autoContinue = true } = {}) {
        initialization ??= (async () => {
          await listenDesktopEvent('claude-runtime-changed', receive)
          try {
            const current = await requestFromDesktop('claudeRuntimeGet', {})
            const runtime = isClaudeRuntimeBusy(current.phase)
              ? current
              : await requestFromDesktop('claudeRuntimeCheck', {})
            receive(runtime)
            if (runtime.phase === 'ready' && autoContinue) set({ hasContinued: true })
          } catch (caught) {
            set({ requestError: caught instanceof Error ? caught.message : String(caught) })
          } finally {
            set({ isInitializing: false })
          }
        })()
        return initialization
      },
      check: (customPath) => request('claudeRuntimeCheck', customPath),
      install: () => request('claudeRuntimeInstall'),
      continue: () => {
        if (get().runtime?.phase === 'ready') set({ hasContinued: true })
      },
    }
  })
}

export const useClaudeRuntimeStore = createClaudeRuntimeStore()

// TEMPORARY: opt in to the manual-detection entry while reviewing onboarding.
if (
  import.meta.env.DEV &&
  import.meta.env.MODE !== 'test' &&
  new URLSearchParams(window.location.search).has('onboarding-preview')
) {
  enableRuntimePreview(useClaudeRuntimeStore)
}
