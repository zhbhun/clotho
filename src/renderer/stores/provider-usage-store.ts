import { createStore } from 'zustand/vanilla'

import { isProviderUsageSupported } from '@/shared/provider'

import type { ProviderUsageQuota } from '../services/claude/claude'
import { claude } from '../services/claude/claude'

/**
 * Remaining-quota snapshots for model providers, keyed by provider id.
 * Shared between the settings provider cards and the model selector so both
 * display the same cached result without duplicating in-flight requests.
 */
export type ProviderUsageState = {
  /** Latest quota per provider; providers without a query result are absent. */
  usage: Record<string, ProviderUsageQuota>
  /** Providers with a request in flight. */
  pendingIds: Record<string, true>
  /**
   * Query one provider and store the result. Transient network failures
   * reject and leave the previous snapshot untouched; deterministic failures
   * (bad key, unsupported provider) are stored as success: false.
   */
  refresh: (provider: { id: string; baseURL: string; authToken: string }) => Promise<void>
  /** Refresh every whitelisted provider, skipping ones already pending. */
  refreshAll: (providers: { id: string; baseURL: string; authToken: string }[]) => Promise<void>
  drop: (providerId: string) => void
}

export function createProviderUsageStore() {
  return createStore<ProviderUsageState>((set, get) => ({
    usage: {},
    pendingIds: {},

    refresh: async (provider) => {
      // Whitelist gate: providers without a known quota endpoint are never
      // queried, so custom or proxy baseURLs get no speculative requests.
      if (!isProviderUsageSupported(provider.baseURL)) return
      if (get().pendingIds[provider.id]) return
      set((state) => ({ pendingIds: { ...state.pendingIds, [provider.id]: true } }))
      try {
        const quota = await claude.getProviderUsage({
          baseURL: provider.baseURL,
          authToken: provider.authToken,
        })
        // Ignore responses that are not well-formed quotas so a stale or
        // mismatched backend can never poison the shared cache.
        if (!isWellFormedQuota(quota)) return
        set((state) => ({ usage: { ...state.usage, [provider.id]: quota } }))
      } finally {
        set((state) => {
          const pendingIds = { ...state.pendingIds }
          delete pendingIds[provider.id]
          return { pendingIds }
        })
      }
    },

    refreshAll: async (providers) => {
      await Promise.all(
        providers
          .filter((provider) => isProviderUsageSupported(provider.baseURL))
          .map((provider) => {
            if (get().pendingIds[provider.id] && get().usage[provider.id]) return Promise.resolve()
            return get().refresh(provider)
          }),
      )
    },

    drop: (providerId) =>
      set((state) => {
        if (!(providerId in state.usage) && !(providerId in state.pendingIds)) return state
        const usage = { ...state.usage }
        delete usage[providerId]
        const pendingIds = { ...state.pendingIds }
        delete pendingIds[providerId]
        return { usage, pendingIds }
      }),
  }))
}

export type ProviderUsageStore = ReturnType<typeof createProviderUsageStore>

function isWellFormedQuota(quota: ProviderUsageQuota | null): quota is ProviderUsageQuota {
  return (
    typeof quota === 'object' &&
    quota !== null &&
    typeof quota.success === 'boolean' &&
    Array.isArray(quota.windows) &&
    typeof quota.queriedAt === 'number'
  )
}
