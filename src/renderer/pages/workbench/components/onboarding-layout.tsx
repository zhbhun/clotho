import type { ReactNode } from 'react'

import { APP_CONTENT_CONTAINER_CLASS } from '../../../components/app-layout'

export function OnboardingLayout({ steps, children }: { steps: ReactNode; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background text-foreground">
      <div className="app-region-drag h-11 shrink-0" />
      <div className="shrink-0 pt-[clamp(1rem,calc((100svh-700px)*0.2),6rem)]">{steps}</div>
      <div className="min-h-0 flex-1 overflow-y-auto px-8">
        <div className="flex min-h-full flex-col">
          <div className="min-h-4 max-h-12 flex-1" />
          <div className={`${APP_CONTENT_CONTAINER_CLASS} shrink-0`}>{children}</div>
          <div className="min-h-6 flex-[2]" />
        </div>
      </div>
    </div>
  )
}
