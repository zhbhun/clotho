import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { appI18n } from '../../../i18n/runtime'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { ModelConfigurationProvider } from '../../../stores/model-configuration-context'
import { ModelOnboarding } from './model-onboarding'

const claudeMock = vi.hoisted(() => ({
  createProvider: vi.fn(),
  fetchProviderModels: vi.fn(),
  saveModelMappings: vi.fn(),
  updateProvider: vi.fn(),
}))

vi.mock('../../../services/claude/claude', async (importOriginal) => ({
  ...(await importOriginal()),
  claude: claudeMock,
}))

describe('ModelOnboarding', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
    vi.clearAllMocks()
    claudeMock.createProvider.mockImplementation(async (provider) => provider)
    claudeMock.saveModelMappings.mockImplementation(async (models) => models)
  })

  it('saves the provider and maps every role to its first model before step two', async () => {
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
    expect(claudeMock.saveModelMappings).toHaveBeenCalledWith({
      sonnet: 'zhipu-glm/glm-5.2[1M]',
      opus: 'zhipu-glm/glm-5.2[1M]',
      fable: 'zhipu-glm/glm-5.2[1M]',
      haiku: 'zhipu-glm/glm-5.2[1M]',
      subagent: 'zhipu-glm/glm-5.2[1M]',
      fallback: 'zhipu-glm/glm-5.2[1M]',
    })
    expect(await screen.findByRole('heading', { level: 2, name: '映射' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '上一步' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '完成' })).toBeInTheDocument()
  })
})
