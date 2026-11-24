import { type ReactNode, useEffect } from 'react'

import { ClaudeRuntimePanel } from '../../../components/claude-runtime'
import { isDesktopRuntime } from '../../../services/desktop/client'
import { useClaudeRuntimeStore } from '../../../stores/claude-runtime-store'
import { WorkbenchStartupLoading } from './loading-state'
import { OnboardingLayout } from './onboarding-layout'
import { OnboardingSteps } from './onboarding-steps'

function RuntimeGate({ children }: { children: ReactNode }) {
  const hasContinued = useClaudeRuntimeStore((state) => state.hasContinued)
  const isInitializing = useClaudeRuntimeStore((state) => state.isInitializing)
  const requestError = useClaudeRuntimeStore((state) => state.requestError)
  const handleContinue = useClaudeRuntimeStore((state) => state.continue)
  const initialize = useClaudeRuntimeStore((state) => state.initialize)
  useEffect(() => {
    void initialize()
  }, [initialize])
  if (hasContinued) return children
  if (isInitializing && !requestError) return <WorkbenchStartupLoading />
  return (
    <OnboardingLayout steps={<OnboardingSteps step={0} />}>
      <ClaudeRuntimePanel onContinue={handleContinue} />
    </OnboardingLayout>
  )
}

export function ClaudeRuntimeBoundary({ children }: { children: ReactNode }) {
  return isDesktopRuntime() ? <RuntimeGate>{children}</RuntimeGate> : children
}
