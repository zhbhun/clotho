import { useState } from 'react'

import { toast } from '@/shadcn/toast'

import type { ModelProvider, ProviderModel } from '../../services/claude/claude'
import { claude } from '../../services/claude/claude'
import {
  autoThinkingForModel,
  createFetchedModelDraft,
  createModelDraft,
  providerFromPreset,
  shiftModelIdErrorIndexes,
} from './provider-draft'
import type { ProviderPreset } from './provider-presets'

/**
 * Shared editing state for a provider draft: the provider being edited, its
 * validation error markers, and model fetching. Shared by the settings
 * provider editor and the workbench onboarding wizard so both stay consistent.
 */
export function useProviderDraft({
  initial,
  fetchErrorToast,
}: {
  initial: ModelProvider | (() => ModelProvider)
  fetchErrorToast: { id?: string; title: string; description?: string }
}) {
  const [provider, setProvider] = useState(initial)
  const [providerIdError, setProviderIdError] = useState<string | null>(null)
  const [modelIdErrorIndexes, setModelIdErrorIndexes] = useState<number[]>([])
  const [isFetchingModels, setIsFetchingModels] = useState(false)

  function clearErrors() {
    setProviderIdError(null)
    setModelIdErrorIndexes([])
  }

  function resetProvider(next: ModelProvider) {
    clearErrors()
    setProvider(next)
  }

  function patchProvider(patch: Partial<ModelProvider>) {
    if (patch.id !== undefined) setProviderIdError(null)
    setProvider((current) => {
      const next = { ...current, ...patch }
      if (patch.id !== undefined && patch.id !== current.id) {
        // Provider ID drives preset matching; refill models that are still
        // on their untouched default mappings.
        next.models = next.models.map((model) => {
          const thinking = autoThinkingForModel(patch.id!, model.id, model)
          return thinking ? { ...model, ...thinking } : model
        })
      }
      return next
    })
  }

  /** Apply a preset to the draft, keeping the credential already entered. */
  function applyPreset(preset: ProviderPreset) {
    clearErrors()
    setProvider((current) => ({ ...providerFromPreset(preset), authToken: current.authToken }))
  }

  function addModel() {
    setProvider((current) => ({ ...current, models: [...current.models, createModelDraft()] }))
  }

  function updateModel(index: number, patch: Partial<ProviderModel>) {
    if (patch.id !== undefined) {
      setModelIdErrorIndexes((current) => current.filter((errorIndex) => errorIndex !== index))
    }
    setProvider((current) => ({
      ...current,
      models: current.models.map((model, modelIndex) => {
        if (modelIndex !== index) return model
        const next = { ...model, ...patch }
        if (patch.id !== undefined && patch.id !== model.id) {
          const thinking = autoThinkingForModel(current.id, patch.id, model)
          if (thinking) Object.assign(next, thinking)
        }
        return next
      }),
    }))
  }

  function removeModel(index: number) {
    setModelIdErrorIndexes((current) => shiftModelIdErrorIndexes(current, index))
    setProvider((current) => ({
      ...current,
      models: current.models.filter((_, modelIndex) => modelIndex !== index),
    }))
  }

  async function fetchModels() {
    setIsFetchingModels(true)
    try {
      const ids = await claude.fetchProviderModels({
        baseURL: provider.baseURL,
        authToken: provider.authToken,
        modelsUrl: provider.modelsUrl,
      })
      setProvider((current) => {
        const existing = new Set(current.models.map((model) => model.id))
        const additions = ids
          .filter((id) => !existing.has(id))
          .map((id) => createFetchedModelDraft(id, current.id))
        return { ...current, models: [...current.models, ...additions] }
      })
    } catch {
      toast.add({ ...fetchErrorToast, type: 'error' })
    } finally {
      setIsFetchingModels(false)
    }
  }

  return {
    addModel,
    applyPreset,
    clearErrors,
    fetchModels,
    isFetchingModels,
    modelIdErrorIndexes,
    patchProvider,
    provider,
    providerIdError,
    removeModel,
    resetProvider,
    setModelIdErrorIndexes,
    setProviderIdError,
    updateModel,
  }
}
