import { type ReactNode, createContext, useContext, useMemo } from 'react'

import { useModelStartup } from '../hooks/use-model-startup'
import { WorkbenchStartupLoading } from './loading-state'

type ModelStartupContextValue = {
  dismissModelOnboarding: () => void
  shouldShowModelOnboarding: boolean
}

const ModelStartupContext = createContext<ModelStartupContextValue | null>(null)

export function ModelStartupBoundary({
  children,
  isProjectCatalogLoaded,
  isSdkWaitBypassed,
}: {
  children: ReactNode
  isProjectCatalogLoaded: boolean
  isSdkWaitBypassed: boolean
}) {
  const modelStartup = useModelStartup(isProjectCatalogLoaded, isSdkWaitBypassed)
  const context = useMemo(
    () => ({
      dismissModelOnboarding: modelStartup.dismissModelOnboarding,
      shouldShowModelOnboarding: modelStartup.shouldShowModelOnboarding,
    }),
    [modelStartup.dismissModelOnboarding, modelStartup.shouldShowModelOnboarding],
  )

  if (modelStartup.phase === 'bootstrap-loading') return <WorkbenchStartupLoading />
  if (modelStartup.phase === 'sdk-loading') return <WorkbenchStartupLoading />

  return <ModelStartupContext.Provider value={context}>{children}</ModelStartupContext.Provider>
}

export function useModelStartupContext() {
  const context = useContext(ModelStartupContext)
  if (!context) {
    throw new Error('useModelStartupContext must be used inside ModelStartupBoundary')
  }
  return context
}
