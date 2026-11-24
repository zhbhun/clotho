import type { ReactNode } from 'react'

import { useModelStartup } from '../hooks/use-model-startup'
import { ModelOnboarding } from '../session/model-onboarding'
import { WorkbenchStartupLoading } from './loading-state'

export function ModelStartupBoundary({
  children,
  isProjectCatalogLoaded,
  isSdkWaitBypassed,
}: {
  children: ReactNode
  isProjectCatalogLoaded: boolean
  isSdkWaitBypassed: boolean
}) {
  const startup = useModelStartup(isProjectCatalogLoaded, isSdkWaitBypassed)
  if (startup.phase === 'bootstrap-loading' || startup.phase === 'sdk-loading')
    return <WorkbenchStartupLoading />
  if (startup.shouldShowModelOnboarding)
    return (
      <ModelOnboarding
        initialStep={startup.initialStep}
        onSkip={startup.dismissModelOnboarding}
        onComplete={startup.completeOnboarding}
      />
    )
  return children
}
