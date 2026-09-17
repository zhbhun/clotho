import { describe, expect, it } from 'vitest'

import { type ModelStartupState, getModelStartupPhase } from './model-startup'

const READY_STATE: ModelStartupState = {
  hasClaudeAuthentication: false,
  hasConfiguredProviders: false,
  hasModelProbeFailed: false,
  hasSdkWaitExpired: false,
  isModelAccessResolved: false,
  isProjectCatalogLoaded: true,
  isProviderSettingsLoaded: true,
  isSdkInitializationComplete: false,
  isSdkWaitBypassed: false,
}

describe('model startup', () => {
  it('keeps bootstrap loading until projects and provider settings are ready', () => {
    expect(getModelStartupPhase({ ...READY_STATE, isProjectCatalogLoaded: false })).toBe(
      'bootstrap-loading',
    )
    expect(getModelStartupPhase({ ...READY_STATE, isProviderSettingsLoaded: false })).toBe(
      'bootstrap-loading',
    )
  })

  it('opens Workbench immediately when a custom provider is configured', () => {
    expect(getModelStartupPhase({ ...READY_STATE, hasConfiguredProviders: true })).toBe('workbench')
  })

  it('waits for unresolved SDK access and shows onboarding when it resolves unauthenticated', () => {
    expect(getModelStartupPhase(READY_STATE)).toBe('sdk-loading')
    expect(getModelStartupPhase({ ...READY_STATE, isModelAccessResolved: true })).toBe('onboarding')
  })

  it('shows onboarding after an SDK probe failure only when no custom provider exists', () => {
    const failedProbe = { ...READY_STATE, hasModelProbeFailed: true }

    expect(getModelStartupPhase(failedProbe)).toBe('onboarding')
    expect(getModelStartupPhase({ ...failedProbe, hasConfiguredProviders: true })).toBe('workbench')
  })

  it('opens Workbench for an authenticated Claude account', () => {
    expect(
      getModelStartupPhase({
        ...READY_STATE,
        hasClaudeAuthentication: true,
        isModelAccessResolved: true,
      }),
    ).toBe('workbench')
  })

  it('opens Workbench when an older SDK response completes without access metadata', () => {
    expect(getModelStartupPhase({ ...READY_STATE, isSdkInitializationComplete: true })).toBe(
      'workbench',
    )
  })

  it('opens Workbench without probing model access for mock projects', () => {
    expect(getModelStartupPhase({ ...READY_STATE, isSdkWaitBypassed: true })).toBe('workbench')
  })

  it('keeps Workbench open after the SDK wait expires even if access later resolves unauthenticated', () => {
    expect(getModelStartupPhase({ ...READY_STATE, hasSdkWaitExpired: true })).toBe('workbench')
    expect(
      getModelStartupPhase({
        ...READY_STATE,
        hasSdkWaitExpired: true,
        isModelAccessResolved: true,
      }),
    ).toBe('workbench')
    expect(
      getModelStartupPhase({
        ...READY_STATE,
        hasSdkWaitExpired: true,
        hasModelProbeFailed: true,
      }),
    ).toBe('workbench')
  })

  it('keeps the initial destination after model access changes', () => {
    const providerSavedAfterOnboardingOpened = {
      ...READY_STATE,
      hasConfiguredProviders: true,
      startupDestination: 'onboarding' as const,
    }
    const accessResolvedAfterWorkbenchOpened = {
      ...READY_STATE,
      isModelAccessResolved: true,
      startupDestination: 'workbench' as const,
    }

    expect(getModelStartupPhase(providerSavedAfterOnboardingOpened)).toBe('onboarding')
    expect(getModelStartupPhase(accessResolvedAfterWorkbenchOpened)).toBe('workbench')
  })
})
