import { type ReactNode, createContext, useContext, useState } from 'react'
import { useStore } from 'zustand'

import {
  type ModelConfigurationState,
  type ModelConfigurationStore,
  createModelConfigurationStore,
} from './model-configuration-store'

const ModelConfigurationContext = createContext<ModelConfigurationStore | null>(null)

export function ModelConfigurationProvider({
  children,
  store,
}: {
  children: ReactNode
  store?: ModelConfigurationStore
}) {
  const [modelConfigurationStore] = useState(store ?? createModelConfigurationStore)

  return (
    <ModelConfigurationContext.Provider value={modelConfigurationStore}>
      {children}
    </ModelConfigurationContext.Provider>
  )
}

export function useModelConfigurationStoreApi() {
  const store = useContext(ModelConfigurationContext)
  if (!store) {
    throw new Error('useModelConfigurationStoreApi must be used inside ModelConfigurationProvider')
  }
  return store
}

export function useModelConfigurationStore<T>(selector: (state: ModelConfigurationState) => T): T {
  return useStore(useModelConfigurationStoreApi(), selector)
}
