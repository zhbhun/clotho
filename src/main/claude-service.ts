import type {
  AppPreferences,
  ClaudeInitializationResult,
  ClaudeModelMappings,
  ClaudePurgeDeadPairsParams,
  ClaudeQueryStartParams,
  ClaudeRewindSessionFilesParams,
  ClaudeSampleContextUsageParams,
  ClaudeSessionQueryEnsureParams,
  ClaudeSessionQueryPushParams,
  ClaudeSessionQueryRebuildParams,
  ClaudeSessionQueryRecycleCheckParams,
  ClaudeStartupParams,
  ClaudeUpdateProjectParams,
  FetchProviderModelsParams,
  GetProviderUsageParams,
  ModelProvider,
} from '@/shared/rpc'

import { getAttachmentPreview, snapshotAttachments } from './claude/attachments'
import { getProjectGitBranch } from './claude/git'
import { buildModelCatalog } from './claude/model-catalog'
import { fetchProviderModels } from './claude/model-fetch'
import type { ModelProxy } from './claude/model-proxy'
import { projectFileSearch } from './claude/project-file-search'
import { setProjectDefaultModel } from './claude/projects'
import { getProviderUsage } from './claude/provider-usage'
import { normalizeProvider } from './claude/providers'
import {
  type ClaudeEventSink,
  closeQuery,
  completeQueryInputStream,
  controlQuery,
  failQueryInputStream,
  pushQueryInputMessage,
  respondToolRequest,
  rewindSessionFiles,
  sampleSessionContextUsage,
  startQuery,
  startQueryInputStream,
  startup,
} from './claude/runner'
import {
  forkSessionAtMessage,
  listSessionSubagents,
  loadSessionHistory,
  loadSubagentMessages,
  loadWorkflowRuns,
  resolveSessionEditAnchor,
} from './claude/session'
import { createSessionQueryRegistry } from './claude/session-registry'
import {
  type SettingsStore,
  sanitizeAppPreferences,
  sanitizeModelMappings,
} from './claude/settings'
import { dropTrailingTurn, purgeDeadPairs } from './claude/transcript'
import {
  addProjectFromFolder,
  createProject,
  deleteSession,
  getProjectSessions,
  listClaudeProjects,
  projectPathForId,
  removeProject,
  renameSession,
  selectFiles,
  selectProjectFolder,
  setProjectLastOpened,
  updateProject,
} from './claude/workspace'

export { buildMainChain, finalizeChain, parseSessionEntries } from './claude/session'
export {
  extractSessionMeta,
  fieldFirst,
  fieldLast,
  firstUserPrompt,
  textFromContent,
} from './claude/session-meta'
export { findProjectPathFromSessions } from './claude/workspace'

/** Merge authenticated Claude models with locally configured providers. */
async function startupWithProviders(
  settingsStore: SettingsStore,
  params?: ClaudeStartupParams,
): Promise<ClaudeInitializationResult> {
  const result = await startup(params)
  const settings = settingsStore.get()
  const catalog = buildModelCatalog(result.models, settings.providers, result.account)
  return {
    ...result,
    ...catalog,
    providers: settings.providers,
    modelMappings: settings.models,
  }
}

function startProxyQuery(
  events: ClaudeEventSink,
  params: ClaudeQueryStartParams,
  proxy: ModelProxy,
) {
  try {
    startQuery(events, params, proxy)
  } catch (caught) {
    const { streamId } = params
    const error = caught instanceof Error ? caught : undefined
    events.onError(streamId, error?.message ?? 'Failed to start query', error?.stack)
    events.onComplete(streamId, false)
  }
}

export function createClaudeDesktopService(
  events: ClaudeEventSink,
  proxy: ModelProxy,
  settingsStore: SettingsStore,
  sessionStore?: {
    sessionOwnership: () => Promise<Record<string, string | null>>
    sessionRebindProject: (ids: { fromProjectId: string; toProjectId: string }) => Promise<void>
  },
  sessionHooks?: {
    /** Fired after a session query was closed because it went idle or was recycled. */
    onSessionRecycled?: (sessionId: string) => void
  },
) {
  const sessionRegistry = createSessionQueryRegistry(events, proxy, {
    onRecycled: sessionHooks?.onSessionRecycled,
  })

  async function persistProvider(provider: ModelProvider, operation: 'create' | 'update') {
    const normalizedProvider = normalizeProvider(provider)
    if (!normalizedProvider) {
      throw new Error('Invalid model provider')
    }
    if (normalizedProvider.id === 'claude') {
      throw new Error('Provider ID is reserved: claude')
    }
    const next = await settingsStore.update((settings) => {
      const providers = [...settings.providers]
      const index = providers.findIndex((item) => item.id === normalizedProvider.id)
      if (operation === 'create' && index >= 0) {
        throw new Error(`Provider ID already exists: ${normalizedProvider.id}`)
      }
      if (operation === 'update' && index < 0) {
        throw new Error(`Provider not found: ${normalizedProvider.id}`)
      }
      if (index >= 0) {
        providers[index] = normalizedProvider
      } else {
        providers.push(normalizedProvider)
      }
      return {
        ...settings,
        providers,
        models: sanitizeModelMappings(settings.models, providers),
      }
    })
    proxy.replaceSettings(next)
    return normalizedProvider
  }

  return {
    startup: (params: ClaudeStartupParams) => startupWithProviders(settingsStore, params),
    listProjects: listClaudeProjects,
    addProjectFromFolder,
    selectProjectFolder,
    createProject,
    updateProject: (params: ClaudeUpdateProjectParams) =>
      updateProject(params, undefined, undefined, sessionStore?.sessionRebindProject),
    removeProject,
    selectFiles,
    getAttachmentPreview,
    prepareAttachments: snapshotAttachments,
    canSearchProjectFiles: projectFileSearch.canSearchProjectFiles,
    listProjectRootEntries: projectFileSearch.listRootEntries,
    enterProjectFileSearchWarmup: projectFileSearch.enterWarmup,
    exitProjectFileSearchWarmup: projectFileSearch.exitWarmup,
    searchProjectFiles: projectFileSearch.search,
    getProjectFileOutline: projectFileSearch.getOutline,
    setProjectLastOpened,
    listSessions: (params: { projectId: string }) =>
      sessionStore
        ? sessionStore
            .sessionOwnership()
            .then((ownership) => getProjectSessions({ ...params, ownership }))
        : getProjectSessions(params),
    getSessionMessages: loadSessionHistory,
    getWorkflowRuns: loadWorkflowRuns,
    listSubagents: listSessionSubagents,
    getSubagentMessages: loadSubagentMessages,
    forkSession: forkSessionAtMessage,
    getSessionEditAnchor: resolveSessionEditAnchor,
    rewindSessionFiles: async (params: ClaudeRewindSessionFilesParams) =>
      rewindSessionFiles({
        cwd: await projectPathForId(params.projectId),
        sessionId: params.sessionId,
        userMessageId: params.userMessageId,
        dryRun: params.dryRun,
      }),
    dropTrailingTurn,
    sampleContextUsage: async (params: ClaudeSampleContextUsageParams) => {
      const live = await sessionRegistry.sampleContextUsage(params)
      // A live query owns the Claude session; a throwaway sampler would collide
      // with it, so a failed live sample stays null instead of falling back.
      if (live !== null || sessionRegistry.hasLiveQuery(params.sessionId ?? '')) return live
      return sampleSessionContextUsage(params, proxy)
    },
    getProjectGitBranch,
    renameSession,
    deleteSession,
    listProviders: () => settingsStore.get().providers,
    listModelMappings: () => settingsStore.get().models,
    fetchProviderModels: (params: FetchProviderModelsParams) => fetchProviderModels(params),
    getProviderUsage: (params: GetProviderUsageParams) => getProviderUsage(params),
    createProvider: ({ provider }: { provider: ModelProvider }) =>
      persistProvider(provider, 'create'),
    updateProvider: ({ provider }: { provider: ModelProvider }) =>
      persistProvider(provider, 'update'),
    deleteProvider: async ({ id }: { id: string }) => {
      const next = await settingsStore.update((settings) => {
        const providers = settings.providers.filter((item) => item.id !== id)
        return {
          ...settings,
          providers,
          models: sanitizeModelMappings(settings.models, providers),
        }
      })
      proxy.replaceSettings(next)
    },
    saveModelMappings: async ({ models }: { models: ClaudeModelMappings }) => {
      const next = await settingsStore.update((settings) => {
        const sanitized = sanitizeModelMappings(models, settings.providers)
        for (const [role, value] of Object.entries(models)) {
          if (value?.trim() && sanitized[role as keyof ClaudeModelMappings] !== value) {
            throw new Error(`Invalid model mapping: ${role}`)
          }
        }
        return { ...settings, models: sanitized }
      })
      proxy.replaceSettings(next)
      return next.models
    },
    getAppPreferences: () => {
      const { language, defaultPermissionMode, appearance } = settingsStore.get()
      return { language, defaultPermissionMode, appearance }
    },
    saveAppPreferences: async ({ preferences }: { preferences: AppPreferences }) => {
      const sanitized = sanitizeAppPreferences(preferences)
      const next = await settingsStore.update((settings) => ({ ...settings, ...sanitized }))
      return {
        language: next.language,
        defaultPermissionMode: next.defaultPermissionMode,
        appearance: next.appearance,
      }
    },
    setProjectModel: (params: { projectId: string; providerId: string; modelId: string }) =>
      setProjectDefaultModel(params),
    startQuery: (params: ClaudeQueryStartParams) => startProxyQuery(events, params, proxy),
    controlQuery,
    closeQuery,
    startQueryInputStream,
    pushQueryInputMessage,
    completeQueryInputStream,
    failQueryInputStream,
    respondToolRequest,
    sessionQueryEnsure: (params: ClaudeSessionQueryEnsureParams) => sessionRegistry.ensure(params),
    sessionQueryPush: (params: ClaudeSessionQueryPushParams) => sessionRegistry.push(params),
    sessionQueryRebuild: (params: ClaudeSessionQueryRebuildParams) =>
      sessionRegistry.rebuild(params),
    sessionQueryRecycleCheck: (params: ClaudeSessionQueryRecycleCheckParams) =>
      sessionRegistry.recycleCheck(params),
    sessionPurgeDeadPairs: (params: ClaudePurgeDeadPairsParams) => purgeDeadPairs(params),
    closeAllSessionQueries: () => sessionRegistry.closeAll(),
  }
}
