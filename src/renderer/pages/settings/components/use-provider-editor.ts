import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '@/shadcn/toast'

import type { ProviderIdErrorKind } from '../../../components/model-configuration/provider-draft'
import {
  createProviderDraft,
  getEmptyModelIdIndexes,
  getProviderIdErrorKind,
  hasInvalidContextWindow,
  providerFromPreset,
  upsertProvider,
} from '../../../components/model-configuration/provider-draft'
import type { ProviderPreset } from '../../../components/model-configuration/provider-presets'
import { useProviderDraft } from '../../../components/model-configuration/use-provider-draft'
import type { ModelProvider } from '../../../services/claude/claude'
import { claude } from '../../../services/claude/claude'
import { useSettingsDetailStore } from './settings-detail-store'

export function useProviderEditor({
  defaultModel,
  providers,
  replaceSettings,
}: {
  defaultModel: string | null
  providers: ModelProvider[]
  replaceSettings: (providers: ModelProvider[], defaultModel: string | null) => void
}) {
  const { t } = useTranslation()
  const [isSavingProvider, setIsSavingProvider] = useState(false)
  const openDetail = useSettingsDetailStore((state) => state.openDetail)
  const backToList = useSettingsDetailStore((state) => state.backToList)
  // The editing mode derives from the shared detail store, so every
  // ProviderSettings instance (list section and detail page) agrees on it.
  const detailView = useSettingsDetailStore((state) => state.view)
  const editingMode: 'create' | 'update' | null =
    detailView.kind === 'detail' && detailView.categoryId === 'models'
      ? detailView.file === null
        ? 'create'
        : 'update'
      : null
  const draft = useProviderDraft({
    initial: createProviderDraft,
    fetchErrorToast: {
      id: 'settings-provider-fetch-models-error',
      title: t('common.toast.fetchFailed'),
      description: t('settings.provider.fetchModelsError'),
    },
  })

  function closeEditor() {
    draft.clearErrors()
    backToList()
  }

  function openBlank() {
    draft.resetProvider(createProviderDraft())
    openDetail('models', null, t('settings.provider.add'))
  }

  function openFromPreset(preset: ProviderPreset) {
    draft.resetProvider(providerFromPreset(preset))
    openDetail('models', null, t('settings.provider.add'))
  }

  function openExisting(provider: ModelProvider) {
    draft.resetProvider({ ...provider, models: provider.models.map((model) => ({ ...model })) })
    openDetail('models', provider.id, t('settings.provider.edit'))
  }

  async function saveEditing() {
    if (!editingMode) return
    const isCreating = editingMode === 'create'
    const provider = { ...draft.provider, id: draft.provider.id.trim() }
    draft.patchProvider({ id: provider.id })
    const idErrorKind = getProviderIdErrorKind(provider.id, providers, isCreating)
    if (idErrorKind) {
      const messages: Record<ProviderIdErrorKind, string> = {
        required: t('settings.provider.idRequired'),
        format: t('settings.provider.idFormat'),
        duplicate: t('settings.provider.idDuplicate'),
      }
      draft.setProviderIdError(messages[idErrorKind])
      return
    }
    const invalidModelIds = getEmptyModelIdIndexes(provider.models)
    if (invalidModelIds.length > 0) {
      draft.setModelIdErrorIndexes(invalidModelIds)
      return
    }
    draft.setModelIdErrorIndexes([])
    if (hasInvalidContextWindow(provider.models)) {
      toast.add({
        id: 'settings-provider-model-context-error',
        title: t('common.toast.cannotSave'),
        description: t('settings.provider.modelContextError'),
        type: 'error',
      })
      return
    }

    setIsSavingProvider(true)
    let saved: ModelProvider
    try {
      saved = isCreating
        ? await claude.createProvider(provider)
        : await claude.updateProvider(provider)
    } catch {
      toast.add({
        id: 'settings-provider-save-error',
        title: t(isCreating ? 'common.toast.createFailed' : 'common.toast.saveFailed'),
        description: t(
          isCreating ? 'settings.provider.createError' : 'settings.provider.saveError',
        ),
        type: 'error',
      })
      setIsSavingProvider(false)
      return
    }

    const nextProviders = upsertProvider(providers, saved)
    replaceSettings(nextProviders, defaultModel)
    draft.clearErrors()
    backToList()

    try {
      replaceSettings(nextProviders, await claude.getDefaultModel())
    } catch {
      toast.add({
        id: 'settings-provider-refresh-after-save-error',
        title: t('common.toast.refreshFailed'),
        description: t('settings.provider.refreshAfterSaveError'),
        type: 'error',
      })
    }
    setIsSavingProvider(false)
  }

  return {
    addModel: draft.addModel,
    applyPresetToEditing: draft.applyPreset,
    closeEditor,
    editingProvider: editingMode ? draft.provider : null,
    fetchModels: draft.fetchModels,
    isEditingExisting: editingMode === 'update',
    isFetchingModels: draft.isFetchingModels,
    isSavingProvider,
    modelIdErrorIndexes: draft.modelIdErrorIndexes,
    openBlank,
    openExisting,
    openFromPreset,
    patchEditing: draft.patchProvider,
    providerIdError: draft.providerIdError,
    removeModel: draft.removeModel,
    saveEditing,
    updateModel: draft.updateModel,
  }
}
