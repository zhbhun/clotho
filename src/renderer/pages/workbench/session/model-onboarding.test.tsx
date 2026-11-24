import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { providerFromPreset } from '../../../components/model-configuration/provider-draft'
import { providerPresets } from '../../../components/model-configuration/provider-presets'
import { appI18n } from '../../../i18n/runtime'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { ModelConfigurationProvider } from '../../../stores/model-configuration-context'
import { createModelConfigurationStore } from '../../../stores/model-configuration-store'
import { ModelOnboarding } from './model-onboarding'

const claudeMock = vi.hoisted(() => ({
  createProvider: vi.fn(),
  fetchProviderModels: vi.fn(),
  getDefaultModel: vi.fn(),
  saveDefaultModel: vi.fn(),
  updateProvider: vi.fn(),
}))

vi.mock('../../../services/claude/claude', async (importOriginal) => ({
  ...(await importOriginal()),
  claude: claudeMock,
}))
vi.mock('../../../components/claude-runtime', () => ({
  ClaudeRuntimePanel: ({ onContinue }: { onContinue: () => void }) => (
    <button onClick={onContinue}>下一步</button>
  ),
}))

describe('ModelOnboarding', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
    vi.clearAllMocks()
    claudeMock.createProvider.mockImplementation(async (provider) => provider)
    claudeMock.updateProvider.mockImplementation(async (provider) => provider)
    claudeMock.saveDefaultModel.mockImplementation(async (model) => model)
  })

  it('saves the provider and its first model as the default model before step two', async () => {
    const user = userEvent.setup()

    render(
      <ModelConfigurationProvider>
        <ShortcutRuntimeProvider runtime={shortcutRuntime}>
          <ModelOnboarding onComplete={vi.fn()} onSkip={vi.fn()} />
        </ShortcutRuntimeProvider>
      </ModelConfigurationProvider>,
    )

    await user.type(screen.getByLabelText('API Key'), 'secret')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    await waitFor(() =>
      expect(claudeMock.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'zhipu-glm',
          authToken: 'secret',
          models: [expect.objectContaining({ id: 'glm-5.2[1M]' })],
        }),
      ),
    )
    expect(claudeMock.saveDefaultModel).toHaveBeenCalledWith('zhipu-glm/glm-5.2[1M]')
    expect(await screen.findByRole('heading', { level: 2, name: '模型映射' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '默认模型' })).toHaveTextContent(
      'Zhipu GLM · GLM-5.2 1M',
    )
    expect(screen.getByRole('button', { name: '上一步' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '完成' })).toBeInTheDocument()
  })

  it('preserves provider drafts when returning to the confirmed environment step', async () => {
    const user = userEvent.setup()
    render(
      <ModelConfigurationProvider>
        <ShortcutRuntimeProvider runtime={shortcutRuntime}>
          <ModelOnboarding onComplete={vi.fn()} onSkip={vi.fn()} />
        </ShortcutRuntimeProvider>
      </ModelConfigurationProvider>,
    )
    await user.type(screen.getByLabelText('API Key'), 'draft-secret')
    await user.click(screen.getByText('运行环境'))
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByLabelText('API Key')).toHaveValue('draft-secret')
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
  })

  it('allows choosing a provider preset after loading an existing provider', async () => {
    const user = userEvent.setup()
    const store = createModelConfigurationStore()
    const provider = { ...providerFromPreset(providerPresets[0]), authToken: 'existing-secret' }
    store.getState().replaceSettings([provider], `${provider.id}/${provider.models[0].id}`)
    render(
      <ModelConfigurationProvider store={store}>
        <ShortcutRuntimeProvider runtime={shortcutRuntime}>
          <ModelOnboarding onComplete={vi.fn()} onSkip={vi.fn()} />
        </ShortcutRuntimeProvider>
      </ModelConfigurationProvider>,
    )

    const providerId = screen.getByRole('combobox', { name: 'ID' })
    await user.clear(providerId)
    await user.type(providerId, 'deep')
    await user.click(await screen.findByRole('option', { name: /deepseek/ }))
    expect(providerId).toHaveValue('deepseek')
    expect(screen.getByLabelText('API Key')).toHaveValue('existing-secret')
    await user.click(screen.getByRole('button', { name: '下一步' }))

    expect(claudeMock.createProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'deepseek',
        baseURL: 'https://api.deepseek.com/anthropic',
        models: expect.arrayContaining([expect.objectContaining({ id: 'deepseek-v4-pro' })]),
      }),
    )
    expect(claudeMock.updateProvider).not.toHaveBeenCalled()
    expect(store.getState().providers).toEqual(expect.arrayContaining([provider]))
  })

  it('initializes from existing settings and keeps confirmed steps available after going back', async () => {
    const user = userEvent.setup()
    const store = createModelConfigurationStore()
    const provider = { ...providerFromPreset(providerPresets[0]), authToken: 'existing-secret' }
    provider.models.push({
      ...provider.models[0],
      id: 'another-model',
      displayName: 'Another model',
    })
    const defaultModel = `${provider.id}/another-model`
    store.getState().replaceSettings([provider], defaultModel)
    const complete = vi.fn()
    render(
      <ModelConfigurationProvider store={store}>
        <ShortcutRuntimeProvider runtime={shortcutRuntime}>
          <ModelOnboarding initialStep={2} onComplete={complete} onSkip={vi.fn()} />
        </ShortcutRuntimeProvider>
      </ModelConfigurationProvider>,
    )
    expect(screen.getByRole('button', { name: '完成' })).toBeEnabled()
    await user.click(screen.getByText('运行环境'))
    await user.click(screen.getByText('连接供应商'))
    expect(screen.getByLabelText('API Key')).toHaveValue('existing-secret')
    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(claudeMock.updateProvider).toHaveBeenCalledOnce()
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
    expect(claudeMock.saveDefaultModel).toHaveBeenCalledWith(defaultModel)
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(complete).toHaveBeenCalledOnce()
  })
})
