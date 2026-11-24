import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ModelConfigurationProvider } from '../../../stores/model-configuration-context'
import { createModelConfigurationStore } from '../../../stores/model-configuration-store'
import { useModelStartup } from './use-model-startup'

vi.mock('../services/model-probe', () => ({
  startModelProbe: vi.fn(() => new Promise(() => {})),
}))

function setup() {
  const store = createModelConfigurationStore()
  store.getState().replaceSettings([], null)
  const hook = renderHook(() => useModelStartup(true, false), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ModelConfigurationProvider store={store}>{children}</ModelConfigurationProvider>
    ),
  })
  return { store, ...hook }
}

describe('environment onboarding', () => {
  it.each(['hasClaudeAuthentication', 'hasConfiguredClaudeModels'] as const)(
    'enters the workbench without flashing onboarding when %s is detected',
    async (signal) => {
      const { store, result } = setup()
      await waitFor(() => expect(result.current.phase).toBe('sdk-loading'))
      expect(result.current.shouldShowModelOnboarding).toBe(false)
      act(() => store.setState({ [signal]: true, isModelAccessResolved: true }))
      expect(result.current.phase).toBe('workbench')
      expect(result.current.shouldShowModelOnboarding).toBe(false)
    },
  )

  it('starts at the provider step and keeps the wizard open after saving a provider until Finish', async () => {
    const { store, result } = setup()
    act(() => store.setState({ isModelAccessResolved: true }))
    await waitFor(() => expect(result.current.shouldShowModelOnboarding).toBe(true))
    expect(result.current.initialStep).toBe(1)
    act(() => {
      store.getState().replaceSettings(
        [
          {
            id: 'custom',
            name: 'Custom',
            baseURL: 'https://example.com',
            authToken: 'secret',
            models: [{ id: 'model', displayName: 'Model', contextWindow: 200_000 }],
          },
        ],
        'custom/model',
      )
    })
    expect(result.current.shouldShowModelOnboarding).toBe(true)
    act(() => result.current.completeOnboarding())
    expect(result.current.shouldShowModelOnboarding).toBe(false)
    expect(result.current.phase).toBe('workbench')
  })
})
