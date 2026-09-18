import type {
  AppPreferences,
  ClaudeInitializationResult,
  ClaudeModelMappings,
  ClaudeQueryStartParams,
  ClaudeRewindSessionFilesParams,
  ClaudeSampleContextUsageParams,
  ClaudeStartupParams,
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
import {
  type SettingsStore,
  sanitizeAppPreferences,
  sanitizeModelMappings,
} from './claude/settings'
import { dropTrailingTurn } from './claude/transcript'
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
) {
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
    updateProject,
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
    listSessions: getProjectSessions,
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
    sampleContextUsage: (params: ClaudeSampleContextUsageParams) =>
      sampleSessionContextUsage(params, proxy),
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
  }
}
