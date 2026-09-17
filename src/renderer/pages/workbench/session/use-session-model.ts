import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import type { ClaudeModelInfo } from '../../../services/claude/claude'
import {
  useComposerStore,
  useModelConfigurationStore,
  useSessionContextStore,
} from './session-controller-context'
import { resolveSessionModel } from './stores/model-selection'

export interface SessionModel {
  /** Effective model id: session choice > project default > global fallback. */
  model: string
  modelOptions: ClaudeModelInfo[]
  providerId: string
  selectedLabel: string
}

/** Resolve the session's effective model and its display label from the catalog, project defaults, and composer selection. */
export function useSessionModel(): SessionModel {
  const { t } = useTranslation()
  const { availableModels, isModelCatalogLoaded, isSdkInitializationComplete, modelMappings } =
    useModelConfigurationStore(
      useShallow((state) => ({
        availableModels: state.availableModels,
        isModelCatalogLoaded: state.isModelCatalogLoaded,
        isSdkInitializationComplete: state.isSdkInitializationComplete,
        modelMappings: state.modelMappings,
      })),
    )
  const { defaultModelId, defaultProviderId } = useSessionContextStore(
    useShallow((state) => ({
      defaultModelId: state.defaultModelId,
      defaultProviderId: state.defaultProviderId,
    })),
  )
  const { selectedModelId, selectedProviderId } = useComposerStore(
    useShallow((state) => ({
      selectedModelId: state.selectedModelId,
      selectedProviderId: state.selectedProviderId,
    })),
  )
  const selection = resolveSessionModel({
    availableModels,
    defaultModelId,
    defaultProviderId,
    isModelCatalogLoaded,
    isSdkInitializationComplete,
    modelMappings,
    selectedModelId,
    selectedProviderId,
  })
  const model = selection?.selectedModelId ?? ''
  const providerId = selection?.selectedProviderId ?? ''
  const selectedOption = availableModels.find(
    (option) => option.providerId === providerId && option.value === model,
  )
  const selectedLabel = selectedOption?.displayName ?? (model || t('workbench.prompt.selectModel'))
  return { model, modelOptions: availableModels, providerId, selectedLabel }
}
