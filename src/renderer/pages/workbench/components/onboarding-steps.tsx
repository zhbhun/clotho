import { useTranslation } from 'react-i18next'

import { cn } from '@/shadcn/utils'

import { APP_CONTENT_CONTAINER_CLASS } from '../../../components/app-layout'

export type OnboardingStep = 0 | 1 | 2

export function OnboardingSteps({
  step,
  onStepChange,
  disabled = false,
  completedStep = step - 1,
}: {
  step: OnboardingStep
  onStepChange?: (step: OnboardingStep) => void
  disabled?: boolean
  completedStep?: number
}) {
  const { t } = useTranslation()
  const steps = [
    t('runtime.environment'),
    t('workbench.onboarding.stepProvider'),
    t('workbench.onboarding.stepModels'),
    t('workbench.onboarding.stepChat'),
  ]
  return (
    <div className={cn(APP_CONTENT_CONTAINER_CLASS, 'flex items-center justify-center gap-3 px-6')}>
      {steps.map((label, index) => (
        <div className="contents" key={label}>
          {index > 0 ? <div className="h-px min-w-2 flex-1 bg-border" /> : null}
          <div
            className={cn(
              'flex items-center gap-2 text-xs text-foreground-subtlest',
              (index === step || index <= completedStep) && 'text-foreground',
              (index === step || index <= completedStep) &&
                onStepChange &&
                !disabled &&
                'cursor-pointer hover:text-foreground/70',
            )}
            onClick={
              (index === step || index <= completedStep) && onStepChange && !disabled
                ? () => onStepChange(index as OnboardingStep)
                : undefined
            }
          >
            <div
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs',
                index === step && 'border-primary bg-primary text-primary-foreground',
                index !== step &&
                  index <= completedStep &&
                  'border-foreground bg-foreground text-background',
              )}
            >
              {index + 1}
            </div>
            <span
              className={cn(
                'hidden font-medium whitespace-nowrap md:inline',
                index === step && 'inline',
              )}
            >
              {label}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
