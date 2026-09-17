import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import { useStore } from 'zustand'

import {
  useModelConfigurationStore,
  useModelConfigurationStoreApi,
} from '../../../stores/model-configuration-context'
import type { SessionController } from './session-controller'
import {
  type SessionControllerRegistry,
  createSessionControllerRegistry,
} from './session-controller-registry'
import type { SessionControllerOptions } from './session-types'
import type { CatalogState } from './stores/catalog-store'
import type { ComposerState } from './stores/composer-store'
import type { SessionContextState } from './stores/context-store'
import type { ConversationState } from './stores/conversation-store'
import type { RuntimeState } from './stores/runtime-store'
import type { UsageState } from './stores/usage-store'

const SessionControllerContext = createContext<SessionController | null>(null)
const SessionControllerRegistryContext = createContext<SessionControllerRegistry | null>(null)

export function SessionControllerRegistryProvider({ children }: { children: ReactNode }) {
  const modelConfigurationStore = useModelConfigurationStoreApi()
  const [registry] = useState(() =>
    createSessionControllerRegistry(undefined, modelConfigurationStore),
  )

  useEffect(() => () => registry.dispose(), [registry])

  return (
    <SessionControllerRegistryContext.Provider value={registry}>
      {children}
    </SessionControllerRegistryContext.Provider>
  )
}

export function useSessionControllerRegistry() {
  const registry = useContext(SessionControllerRegistryContext)
  if (!registry)
    throw new Error(
      'useSessionControllerRegistry must be used inside SessionControllerRegistryProvider',
    )
  return registry
}

export function SessionControllerProvider({
  children,
  ...options
}: SessionControllerOptions & { children: ReactNode }) {
  const registry = useSessionControllerRegistry()
  const [controller] = useState(() => registry.get(options))

  useEffect(() => {
    controller.syncOptions({
      ...controller.options,
      additionalDirectories: options.additionalDirectories,
      claudeSessionId: options.claudeSessionId,
      defaultModelId: options.defaultModelId,
      defaultProviderId: options.defaultProviderId,
      isHomeMode: options.isHomeMode,
      isMockProject: options.isMockProject,
      onActivityChange: options.onActivityChange,
      onBindClaudeSession: options.onBindClaudeSession,
      onModelConfigurationRequired: options.onModelConfigurationRequired,
      onProjectDefaultModelChange: options.onProjectDefaultModelChange,
      onPromptEdited: options.onPromptEdited,
      onPromptStarted: options.onPromptStarted,
      onPromptRecalled: options.onPromptRecalled,
      onStartNewSession: options.onStartNewSession,
      onRefreshCatalog: options.onRefreshCatalog,
      projectId: options.projectId,
      projectPath: options.projectPath,
      sessionTitle: options.sessionTitle,
    })
  }, [
    controller,
    options.additionalDirectories,
    options.claudeSessionId,
    options.defaultModelId,
    options.defaultProviderId,
    options.isHomeMode,
    options.isMockProject,
    options.onActivityChange,
    options.onBindClaudeSession,
    options.onModelConfigurationRequired,
    options.onProjectDefaultModelChange,
    options.onPromptEdited,
    options.onPromptStarted,
    options.onPromptRecalled,
    options.onStartNewSession,
    options.onRefreshCatalog,
    options.projectId,
    options.projectPath,
    options.sessionTitle,
  ])

  useEffect(() => {
    // Initialization can take up to 60 seconds. Do not activate a follower after unmount.
    let isCancelled = false
    void controller.initialize().then(() => {
      if (!isCancelled) controller.activate()
    })
    return () => {
      isCancelled = true
      controller.deactivate()
    }
  }, [controller])

  return (
    <SessionControllerContext.Provider value={controller}>
      {children}
    </SessionControllerContext.Provider>
  )
}

export function useSessionController() {
  const controller = useContext(SessionControllerContext)
  if (!controller)
    throw new Error('useSessionController must be used inside SessionControllerProvider')
  return controller
}

export function useSessionContextStore<T>(selector: (state: SessionContextState) => T): T {
  return useStore(useSessionController().contextStore, selector)
}

export function useComposerStore<T>(selector: (state: ComposerState) => T): T {
  return useStore(useSessionController().composerStore, selector)
}

export function useConversationStore<T>(selector: (state: ConversationState) => T): T {
  return useStore(useSessionController().conversationStore, selector)
}

export function useRuntimeStore<T>(selector: (state: RuntimeState) => T): T {
  return useStore(useSessionController().runtimeStore, selector)
}

export function useUsageStore<T>(selector: (state: UsageState) => T): T {
  return useStore(useSessionController().usageStore, selector)
}

export function useCatalogStore<T>(selector: (state: CatalogState) => T): T {
  return useStore(useSessionController().catalogStore, selector)
}

export { useModelConfigurationStore }
