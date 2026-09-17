import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useShallow } from 'zustand/react/shallow'

import { toast } from '@/shadcn/toast'

import type { ModelProvider } from '../../../services/claude/claude'
import { claude } from '../../../services/claude/claude'
import { loadModelSettings } from '../../../services/claude/model-settings'
import {
  useModelConfigurationStore,
  useModelConfigurationStoreApi,
} from '../../../stores/model-configuration-context'
import { useProviderUsageStore } from '../../../stores/provider-usage-context'
import { useProviderEditor } from './use-provider-editor'

export function useProviderSettings() {
  const { t } = useTranslation()
  const modelStore = useModelConfigurationStoreApi()
  const { isSettingsLoaded, modelMappings, providers, replaceSettings } =
    useModelConfigurationStore(
      useShallow((state) => ({
        isSettingsLoaded: state.isSettingsLoaded,
        modelMappings: state.modelMappings,
        providers: state.providers,
        replaceSettings: state.replaceSettings,
      })),
    )
  const usageByProviderId = useProviderUsageStore((state) => state.usage)
  const usagePendingIds = useProviderUsageStore((state) => state.pendingIds)
  const refreshProviderUsage = useProviderUsageStore((state) => state.refreshAll)
  const dropProviderUsage = useProviderUsageStore((state) => state.drop)
  const [isLoading, setIsLoading] = useState(!isSettingsLoaded)
  const [hasLoadError, setHasLoadError] = useState(false)
  const [deletingProviderId, setDeletingProviderId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ModelProvider | null>(null)
  const editor = useProviderEditor({ modelMappings, providers, replaceSettings })

  const loadModelConfiguration = useCallback(async () => {
    setIsLoading(true)
    setHasLoadError(false)
    try {
      await loadModelSettings(modelStore)
    } catch {
      setHasLoadError(true)
    } finally {
      setIsLoading(false)
    }
  }, [modelStore])

  useEffect(() => {
    if (isSettingsLoaded) {
      setHasLoadError(false)
      setIsLoading(false)
      return
    }
    void loadModelConfiguration()
  }, [isSettingsLoaded, loadModelConfiguration])

  // Fetch quota for every provider once the settings are available; the store
  // keeps results cached so the model selector can reuse them later.
  useEffect(() => {
    if (!isSettingsLoaded || providers.length === 0) return
    void refreshProviderUsage(providers).catch(() => {})
  }, [isSettingsLoaded, providers, refreshProviderUsage])

  async function deleteProvider(id: string) {
    if (deletingProviderId) return
    setDeletingProviderId(id)
    try {
      await claude.deleteProvider(id)
    } catch {
      toast.add({
        id: 'settings-provider-delete-error',
        title: t('common.toast.deleteFailed'),
        description: t('settings.provider.deleteError'),
        type: 'error',
      })
      setDeletingProviderId(null)
      return
    }

    setDeleteTarget(null)
    const nextProviders = providers.filter((item) => item.id !== id)
    replaceSettings(nextProviders, modelMappings)
    dropProviderUsage(id)
    if (editor.editingProvider?.id === id) editor.closeEditor()

    try {
      replaceSettings(nextProviders, await claude.listModelMappings())
    } catch {
      toast.add({
        id: 'settings-provider-refresh-after-delete-error',
        title: t('common.toast.refreshFailed'),
        description: t('settings.provider.refreshAfterDeleteError'),
        type: 'error',
      })
    }
    setDeletingProviderId(null)
  }

  async function saveModelMappings(models: typeof modelMappings) {
    const saved = await claude.saveModelMappings(models)
    replaceSettings(providers, saved)
    return saved
  }

  return {
    deleteProvider,
    deleteTarget,
    deletingProviderId,
    hasLoadError,
    isLoading,
    loadModelConfiguration,
    modelMappings,
    providers,
    refreshProviderUsage,
    saveModelMappings,
    setDeleteTarget,
    usageByProviderId,
    usagePendingIds,
    ...editor,
  }
}
