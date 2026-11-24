import { describe, expect, it } from 'vitest'

import { type ModelStartupState, getModelStartupPhase } from './model-startup'

const READY_STATE: ModelStartupState = {
  hasConfiguredClaudeModels: false,
  hasClaudeAuthentication: false,
  hasConfiguredProviders: false,
  hasModelProbeFailed: false,
  isModelAccessResolved: false,
  isModelProbePending: false,
  isProjectCatalogLoaded: true,
  isProviderSettingsLoaded: true,
  isSdkInitializationComplete: false,
  isSdkWaitBypassed: false,
}

describe('environment-based onboarding startup policy', () => {
  it('waits for a runtime refresh instead of making a decision from stale account state', () => {
    expect(
      getModelStartupPhase({
        ...READY_STATE,
        isModelProbePending: true,
        isModelAccessResolved: true,
        isSdkInitializationComplete: true,
        hasModelProbeFailed: true,
      }),
    ).toBe('sdk-loading')
    expect(
      getModelStartupPhase({
        ...READY_STATE,
        isModelProbePending: true,
        hasClaudeAuthentication: true,
      }),
    ).toBe('sdk-loading')
  })

  it('waits for project and provider settings before choosing a step', () => {
    expect(getModelStartupPhase({ ...READY_STATE, isProjectCatalogLoaded: false })).toBe(
      'bootstrap-loading',
    )
    expect(getModelStartupPhase({ ...READY_STATE, isProviderSettingsLoaded: false })).toBe(
      'bootstrap-loading',
    )
  })
  it.each([
    'hasConfiguredProviders',
    'hasClaudeAuthentication',
    'hasConfiguredClaudeModels',
  ] as const)('skips onboarding when %s is available', (signal) => {
    expect(getModelStartupPhase({ ...READY_STATE, [signal]: true })).toBe('workbench')
  })
  it('waits for the account probe when there is no saved provider', () => {
    expect(getModelStartupPhase(READY_STATE)).toBe('sdk-loading')
    expect(getModelStartupPhase({ ...READY_STATE, isModelAccessResolved: true })).toBe('onboarding')
    expect(getModelStartupPhase({ ...READY_STATE, isSdkInitializationComplete: true })).toBe(
      'onboarding',
    )
  })
  it('shows onboarding after probe failure instead of treating failure as completion', () => {
    expect(getModelStartupPhase({ ...READY_STATE, hasModelProbeFailed: true })).toBe('onboarding')
  })
  it('keeps mock workspaces independent of account onboarding', () => {
    expect(getModelStartupPhase({ ...READY_STATE, isSdkWaitBypassed: true })).toBe('workbench')
  })
})
