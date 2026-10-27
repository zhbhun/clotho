import type {
  AgentHookGroup,
  AgentMcpServerConfig,
  AgentSubagentConfig,
  AppPreferences,
  ClaudeInitializationResult,
  ClaudePurgeDeadPairsParams,
  ClaudeRewindSessionFilesParams,
  ClaudeSampleContextUsageParams,
  ClaudeSessionQueryEnsureParams,
  ClaudeSessionQueryPushParams,
  ClaudeSessionQueryRebuildParams,
  ClaudeSessionQueryRecycleCheckParams,
  ClaudeSessionQuerySetModelParams,
  ClaudeSessionRuntimeChanged,
  ClaudeStartupParams,
  ClaudeStreamId,
  ClaudeToolResult,
  ClaudeUpdateProjectParams,
  FetchProviderModelsParams,
  GetProviderUsageParams,
  ModelProvider,
} from '@/shared/rpc'
import type { SessionListFlags } from '@/shared/session'

import { deleteHookGroup, listHookGroups, saveHookGroup } from './claude/agent-config/hooks'
import { deleteMcpServer, listMcpServers, saveMcpServer } from './claude/agent-config/mcp-servers'
import {
  addMarketplace,
  installPlugin,
  listInstalledPlugins,
  listMarketplaces,
  removeInstalledPlugin,
  removeMarketplace,
} from './claude/agent-config/plugins'
import { deleteSkill, listSkills } from './claude/agent-config/skills'
import {
  deleteSubagentConfig,
  listSubagentConfigs,
  saveSubagentConfig,
} from './claude/agent-config/subagents'
import {
  deleteWorkflow,
  listWorkflows,
  readWorkflow,
  renameWorkflow,
  saveWorkflow,
} from './claude/agent-config/workflows'
import { getAttachmentPreview, snapshotAttachments } from './claude/attachments'
import { getProjectGitBranch, listProjectGitBranches, switchProjectGitBranch } from './claude/git'
import { buildModelCatalog } from './claude/model-catalog'
import { fetchProviderModels } from './claude/model-fetch'
import type { ModelProxy } from './claude/model-proxy'
import { projectFileSearch } from './claude/project-file-search'
import { setProjectDefaultModel } from './claude/projects'
import { getProviderUsage } from './claude/provider-usage'
import { normalizeProvider } from './claude/providers'
import {
  type AgentCapabilityFilters,
  type ClaudeEventSink,
  controlQuery,
  rewindSessionFiles,
  sampleSessionContextUsage,
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
import { type SettingsStore, sanitizeAppPreferences, sanitizeDefaultModel } from './claude/settings'
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
    defaultModel: settings.defaultModel,
  }
}

export function createClaudeDesktopService(
  events: ClaudeEventSink,
  proxy: ModelProxy,
  settingsStore: SettingsStore,
  sessionStore?: {
    sessionOwnership: () => Promise<Record<string, string | null>>
    sessionRebindProject: (ids: { fromProjectId: string; toProjectId: string }) => Promise<void>
    sessionSetArchived: (params: {
      sessions: Array<{ projectId: string; sessionId: string }>
      archived: boolean
    }) => Promise<void>
    sessionSetPinned: (params: {
      sessions: Array<{
        projectId: string | null
        sessionId: string
        claudeSessionId: string | null
      }>
      pinned: boolean
    }) => Promise<void>
    sessionSetUnread: (params: {
      sessions: Array<{
        projectId: string | null
        sessionId: string
        claudeSessionId: string | null
      }>
      unread: 'success' | 'error' | null
    }) => Promise<void>
    sessionListFlags: () => Promise<Record<string, SessionListFlags>>
  },
  sessionHooks?: {
    /** Fired after a session query was closed because it went idle or was recycled. */
    onSessionRecycled?: (sessionId: string) => void
    /** Fired on every live-shape change of a session query; broadcast to all windows. */
    onSessionRuntimeChanged?: (change: ClaudeSessionRuntimeChanged) => void
  },
) {
  const sessionRegistry = createSessionQueryRegistry(events, proxy, {
    onRecycled: sessionHooks?.onSessionRecycled,
    onRuntimeChanged: sessionHooks?.onSessionRuntimeChanged,
    resolveAgentCapabilities: async () => {
      const capabilities = settingsStore.get().agentCapabilities
      if (!capabilities) return undefined
      const disabledPlugins = capabilities.disabledPlugins ?? []
      const disabledSkills = capabilities.disabledSkills ?? []
      const disabledMcpServers = capabilities.disabledMcpServers ?? []
      const [installed, mcp] = await Promise.all([
        disabledPlugins.length ? listInstalledPlugins() : Promise.resolve([]),
        disabledMcpServers.length ? listMcpServers() : Promise.resolve(null),
      ])
      const enabledPaths = installed
        .filter((plugin) => !disabledPlugins.includes(plugin.id))
        .map((plugin) => plugin.installPath)
      const enabledServers =
        mcp && disabledMcpServers.length
          ? Object.fromEntries(
              mcp.servers
                .filter((server) => !disabledMcpServers.includes(server.name))
                .flatMap(
                  (
                    server,
                  ): Array<
                    [string, NonNullable<AgentCapabilityFilters['enabledMcpServers']>[string]]
                  > => {
                    // Map the loose file config onto the SDK's strict union;
                    // entries failing their type's required field are dropped.
                    if (server.type === 'stdio') {
                      return server.command
                        ? [
                            [
                              server.name,
                              {
                                type: 'stdio',
                                command: server.command,
                                args: server.args,
                                env: server.env,
                              },
                            ],
                          ]
                        : []
                    }
                    return server.url
                      ? [
                          server.type === 'sse'
                            ? [
                                server.name,
                                { type: 'sse' as const, url: server.url, headers: server.headers },
                              ]
                            : [
                                server.name,
                                { type: 'http' as const, url: server.url, headers: server.headers },
                              ],
                        ]
                      : []
                  },
                ),
            )
          : undefined
      return {
        disabledSkills,
        enabledPlugins: enabledPaths.length
          ? Object.fromEntries(
              enabledPaths.map((installPath, index) => [String(index), installPath]),
            )
          : undefined,
        enabledMcpServers: enabledServers,
      }
    },
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
        defaultModel: sanitizeDefaultModel(settings.defaultModel, providers),
      }
    })
    proxy.replaceSettings(next.providers)
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
            .then((sessions) =>
              sessionStore.sessionListFlags().then((flags) =>
                sessions.map((session) => {
                  const flag = flags[session.id]
                  if (!flag) return session
                  return {
                    ...session,
                    archived: flag.archived || undefined,
                    archived_at: flag.archived ? flag.archivedAt : undefined,
                    unarchived_at: flag.unarchivedAt,
                    pinned_at: flag.pinnedAt,
                    unread: flag.unread,
                  }
                }),
              ),
            )
        : getProjectSessions(params),
    setSessionsArchived: (params: {
      sessions: Array<{ projectId: string; sessionId: string }>
      archived: boolean
    }) => {
      if (!sessionStore) throw new Error('Session storage is unavailable')
      return sessionStore.sessionSetArchived(params)
    },
    setSessionsPinned: (params: {
      sessions: Array<{
        projectId: string | null
        sessionId: string
        claudeSessionId: string | null
      }>
      pinned: boolean
    }) => {
      if (!sessionStore) throw new Error('Session storage is unavailable')
      return sessionStore.sessionSetPinned(params)
    },
    setSessionsUnread: (params: {
      sessions: Array<{
        projectId: string | null
        sessionId: string
        claudeSessionId: string | null
      }>
      unread: 'success' | 'error' | null
    }) => {
      if (!sessionStore) throw new Error('Session storage is unavailable')
      return sessionStore.sessionSetUnread(params)
    },
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
    listProjectGitBranches,
    switchProjectGitBranch,
    renameSession,
    deleteSession,
    listProviders: () => settingsStore.get().providers,
    getDefaultModel: () => settingsStore.get().defaultModel ?? null,
    fetchProviderModels: (params: FetchProviderModelsParams) => fetchProviderModels(params),
    getProviderUsage: (params: GetProviderUsageParams) => getProviderUsage(params),
    listAgentSubagents: async (): Promise<AgentSubagentConfig[]> => {
      const files = await listSubagentConfigs()
      return files.map((file) =>
        'broken' in file
          ? { file: file.file, body: '', broken: true }
          : {
              file: file.file,
              name: file.fields.name,
              description: file.fields.description,
              tools: file.fields.tools,
              model: file.fields.model,
              body: file.body,
            },
      )
    },
    saveAgentSubagent: ({ subagent }: { subagent: AgentSubagentConfig }) =>
      saveSubagentConfig({
        file: subagent.file,
        frontmatter: {
          name: subagent.name,
          description: subagent.description,
          tools: subagent.tools,
          model: subagent.model,
        },
        body: subagent.body,
      }),
    deleteAgentSubagent: ({ file }: { file: string }) => deleteSubagentConfig(file),
    listAgentMcpServers: async () => {
      const { servers } = await listMcpServers()
      return servers.map(({ name, type, command, args, env, url, headers }) => ({
        name,
        type,
        command,
        args,
        env,
        url,
        headers,
      }))
    },
    saveAgentMcpServer: ({
      server,
      previousName,
    }: {
      server: AgentMcpServerConfig
      previousName?: string
    }) => {
      const { name, type, command, args, env, url, headers } = server
      const persist = () => saveMcpServer(name, { type, command, args, env, url, headers })
      if (previousName && previousName !== name) {
        return persist().then(() => deleteMcpServer(previousName))
      }
      return persist()
    },
    deleteAgentMcpServer: ({ name }: { name: string }) => deleteMcpServer(name),
    listAgentHookGroups: (): Promise<AgentHookGroup[]> => listHookGroups(),
    saveAgentHookGroup: ({ group }: { group: AgentHookGroup }) =>
      saveHookGroup(group.event, group.entries),
    deleteAgentHookGroup: ({ event }: { event: string }) => deleteHookGroup(event),
    listAgentSkills: () => listSkills(),
    deleteAgentSkill: ({ name }: { name: string }) => deleteSkill(name),
    listAgentPlugins: () => listInstalledPlugins(),
    listAgentMarketplaces: () => listMarketplaces(),
    addAgentMarketplace: ({ gitUrl }: { gitUrl: string }) =>
      addMarketplace(gitUrl).then((name) => ({ name })),
    removeAgentMarketplace: ({ name }: { name: string }) => removeMarketplace(name),
    installAgentPlugin: ({ marketplace, plugin }: { marketplace: string; plugin: string }) =>
      installPlugin(marketplace, plugin),
    removeAgentPlugin: ({ id }: { id: string }) => removeInstalledPlugin(id),
    listAgentWorkflows: () => listWorkflows(),
    readAgentWorkflow: ({ name }: { name: string }) =>
      readWorkflow(name).then((content) => ({ content })),
    saveAgentWorkflow: ({ name, content }: { name: string; content: string }) =>
      saveWorkflow(name, content),
    renameAgentWorkflow: ({ from, to }: { from: string; to: string }) => renameWorkflow(from, to),
    deleteAgentWorkflow: ({ name }: { name: string }) => deleteWorkflow(name),
    getAgentCapabilityToggles: async () => {
      const toggles = settingsStore.get().agentCapabilities
      return {
        disabledPlugins: toggles?.disabledPlugins ?? [],
        disabledSkills: toggles?.disabledSkills ?? [],
        disabledMcpServers: toggles?.disabledMcpServers ?? [],
      }
    },
    setAgentCapabilityToggle: async ({
      kind,
      name,
      enabled,
    }: {
      kind: 'plugin' | 'skill' | 'mcp'
      name: string
      enabled: boolean
    }) => {
      const key =
        kind === 'plugin'
          ? 'disabledPlugins'
          : kind === 'mcp'
            ? 'disabledMcpServers'
            : 'disabledSkills'
      const next = await settingsStore.update((settings) => {
        const current = settings.agentCapabilities ?? {}
        const disabled = new Set(current[key] ?? [])
        if (enabled) disabled.delete(name)
        else disabled.add(name)
        return { ...settings, agentCapabilities: { ...current, [key]: [...disabled] } }
      })
      return {
        disabledPlugins: next.agentCapabilities?.disabledPlugins ?? [],
        disabledSkills: next.agentCapabilities?.disabledSkills ?? [],
        disabledMcpServers: next.agentCapabilities?.disabledMcpServers ?? [],
      }
    },
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
          defaultModel: sanitizeDefaultModel(settings.defaultModel, providers),
        }
      })
      proxy.replaceSettings(next.providers)
    },
    saveDefaultModel: async ({ defaultModel }: { defaultModel: string | null }) => {
      const next = await settingsStore.update((settings) => {
        const sanitized = sanitizeDefaultModel(defaultModel, settings.providers)
        if (typeof defaultModel === 'string' && defaultModel.trim() && !sanitized) {
          throw new Error(`Invalid default model: ${defaultModel}`)
        }
        return { ...settings, defaultModel: sanitized }
      })
      proxy.replaceSettings(next.providers)
      return next.defaultModel ?? null
    },
    getAppPreferences: () => {
      const { language, defaultPermissionMode, appearance, archiveInactiveSessions } =
        settingsStore.get()
      return { language, defaultPermissionMode, appearance, archiveInactiveSessions }
    },
    saveAppPreferences: async ({ preferences }: { preferences: AppPreferences }) => {
      const sanitized = sanitizeAppPreferences(preferences)
      const next = await settingsStore.update((settings) => ({ ...settings, ...sanitized }))
      return {
        language: next.language,
        defaultPermissionMode: next.defaultPermissionMode,
        appearance: next.appearance,
        archiveInactiveSessions: next.archiveInactiveSessions,
      }
    },
    setProjectModel: (params: { projectId: string; providerId: string; modelId: string }) =>
      setProjectDefaultModel(params),
    controlQuery,
    sessionQueryEnsure: (params: ClaudeSessionQueryEnsureParams) => sessionRegistry.ensure(params),
    sessionQueryAttach: (params: { sessionId: string }) => sessionRegistry.attach(params),
    sessionQueryPush: (params: ClaudeSessionQueryPushParams) => sessionRegistry.push(params),
    sessionQueryRebuild: (params: ClaudeSessionQueryRebuildParams) =>
      sessionRegistry.rebuild(params),
    sessionQueryRecycleCheck: (params: ClaudeSessionQueryRecycleCheckParams) =>
      sessionRegistry.recycleCheck(params),
    sessionRespondTool: (params: {
      streamId: ClaudeStreamId
      toolUseId: string
      result: ClaudeToolResult
    }) => sessionRegistry.respondTool(params),
    sessionViewOpened: (params: { sessionId: string; windowId: string }) =>
      sessionRegistry.viewOpened(params.sessionId, params.windowId),
    sessionViewClosed: (params: { sessionId: string; windowId: string }) =>
      sessionRegistry.viewClosed(params.sessionId, params.windowId),
    sessionDropWindow: (windowId: string) => sessionRegistry.dropWindow(windowId),
    sessionQuerySetModel: (params: ClaudeSessionQuerySetModelParams) =>
      sessionRegistry.setModel(params),
    sessionQueryClose: (sessionId: string) => sessionRegistry.close(sessionId),
    sessionPurgeDeadPairs: (params: ClaudePurgeDeadPairsParams) => purgeDeadPairs(params),
    closeAllSessionQueries: () => sessionRegistry.closeAll(),
  }
}
