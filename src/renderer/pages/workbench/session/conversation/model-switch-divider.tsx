import { ArrowLeftRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { useModelConfigurationStore } from '../session-controller-context'
import { modelDisplayLabel } from '../stores/model-selection'

/**
 * Full-width divider between turns where the assistant model changed: the two
 * display labels joined by an arrow on a hairline.
 */
export function ModelSwitchDivider({ fromModel, toModel }: { fromModel: string; toModel: string }) {
  const { t } = useTranslation()
  const availableModels = useModelConfigurationStore((state) => state.availableModels)
  const from = modelDisplayLabel(availableModels, fromModel)
  const to = modelDisplayLabel(availableModels, toModel)

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="h-px min-w-8 flex-1 bg-border" />
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-foreground-subtlest">
        <ArrowLeftRight className="size-3.5" />
        {t('workbench.conversation.modelSwitched', { from, to })}
      </span>
      <div className="h-px min-w-8 flex-1 bg-border" />
    </div>
  )
}
