import { MIN_CLAUDE_VERSION } from '@/shared/claude-runtime'

import type { useClaudeRuntimeStore } from './claude-runtime-store'

/** TEMPORARY: remove this module and its activation after onboarding review. */
export function enableRuntimePreview(store: typeof useClaudeRuntimeStore) {
  const live = store.getState()
  let hasStarted = false
  const initial = {
    phase: 'missing' as const,
    minimumVersion: MIN_CLAUDE_VERSION,
    customPath: '',
    installPath: '~/.local/bin/claude',
    logs: '',
  }
  async function check(customPath?: string) {
    if (customPath !== undefined) {
      await live.check(customPath)
      if (store.getState().requestError) return
    }
    if (!hasStarted) {
      hasStarted = true
      await live.initialize({ autoContinue: false })
    } else if (customPath === undefined) {
      await live.check()
    }
  }
  store.setState({
    runtime: initial,
    isInitializing: false,
    hasContinued: false,
    initialize: async () => {},
    check,
    install: async () => {
      await check()
      if (store.getState().runtime?.phase !== 'ready' && !store.getState().requestError) {
        await live.install()
      }
    },
  })
}
