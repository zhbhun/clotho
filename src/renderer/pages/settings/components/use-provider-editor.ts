import { useRef, useState } from 'react'
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
import type { ClaudeModelMappings, ModelProvider } from '../../../services/claude/claude'
import { claude } from '../../../services/claude/claude'

export function useProviderEditor({
  modelMappings,
  providers,
  replaceSettings,
}: {
  modelMappings: ClaudeModelMappings
  providers: ModelProvider[]
  replaceSettings: (providers: ModelProvider[], modelMappings: ClaudeModelMappings) => void
}) {
  const { t } = useTranslation()
  const [editingMode, setEditingMode] = useState<'create' | 'update' | null>(null)
  const [isSavingProvider, setIsSavingProvider] = useState(false)
  const editorTriggerRef = useRef<HTMLButtonElement | null>(null)
  const draft = useProviderDraft({
    initial: createProviderDraft,
    fetchErrorToast: {
      id: 'settings-provider-fetch-models-error',
      title: t('common.toast.fetchFailed'),
      description: t('settings.provider.fetchModelsError'),
    },
  })

  function closeEditor() {
    setEditingMode(null)
    draft.clearErrors()
  }

  function openBlank() {
    editorTriggerRef.current = null
    draft.resetProvider(createProviderDraft())
    setEditingMode('create')
  }

  function openFromPreset(preset: ProviderPreset) {
    editorTriggerRef.current = null
    draft.resetProvider(providerFromPreset(preset))
    setEditingMode('create')
  }

  function openExisting(provider: ModelProvider, trigger: HTMLButtonElement) {
    editorTriggerRef.current = trigger
    draft.resetProvider({ ...provider, models: provider.models.map((model) => ({ ...model })) })
    setEditingMode('update')
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
    replaceSettings(nextProviders, modelMappings)
    setEditingMode(null)

    try {
      replaceSettings(nextProviders, await claude.listModelMappings())
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
    editorTriggerRef,
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
