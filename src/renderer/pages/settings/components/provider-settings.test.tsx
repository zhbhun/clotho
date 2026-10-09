import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'

import { appI18n } from '../../../i18n/runtime'
import type { ModelProvider } from '../../../services/claude/claude'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { ModelConfigurationProvider } from '../../../stores/model-configuration-context'
import { ProviderUsageProvider } from '../../../stores/provider-usage-context'
import { ProviderSettings } from './provider-settings'

const claudeMock = vi.hoisted(() => ({
  createProvider: vi.fn(),
  deleteProvider: vi.fn(),
  fetchProviderModels: vi.fn(),
  getDefaultModel: vi.fn(),
  listProviders: vi.fn(),
  saveDefaultModel: vi.fn(),
  updateProvider: vi.fn(),
}))

vi.mock('../../../services/claude/claude', () => ({
  claude: claudeMock,
}))

const PROVIDERS: ModelProvider[] = [
  {
    id: 'zhipu',
    name: 'Zhipu',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    authToken: 'secret',
    models: [{ id: 'glm-5.2', displayName: 'GLM-5.2', contextWindow: 200_000 }],
  },
]

function renderWithShortcuts(element: ReactElement) {
  return render(
    <ProviderUsageProvider>
      <ModelConfigurationProvider>
        <ShortcutRuntimeProvider runtime={shortcutRuntime}>{element}</ShortcutRuntimeProvider>
      </ModelConfigurationProvider>
    </ProviderUsageProvider>,
  )
}

describe('ProviderSettings', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
    vi.clearAllMocks()
    claudeMock.listProviders.mockResolvedValue(PROVIDERS)
    claudeMock.getDefaultModel.mockResolvedValue('zhipu/glm-5.2')
    claudeMock.saveDefaultModel.mockImplementation(async (model) => model)
    claudeMock.createProvider.mockImplementation(async (provider) => provider)
    claudeMock.updateProvider.mockImplementation(async (provider) => provider)
  })

  it('loads and automatically saves the default model from the settings service', async () => {
    const user = userEvent.setup()
    claudeMock.getDefaultModel.mockResolvedValue(null)

    renderWithShortcuts(<ProviderSettings />)

    expect(await screen.findByRole('heading', { level: 2, name: '默认模型' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '供应商' })).toBeInTheDocument()
    expect(claudeMock.listProviders).toHaveBeenCalledOnce()
    expect(claudeMock.getDefaultModel).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('button', { name: '默认模型' }))
    await user.click(await screen.findByText('GLM-5.2'))

    await waitFor(() => expect(claudeMock.saveDefaultModel).toHaveBeenCalledWith('zhipu/glm-5.2'))
  })

  it('prevents saving a provider with an invalid model context window', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(
      <Toaster>
        <ProviderSettings />
      </Toaster>,
    )

    await screen.findByRole('heading', { level: 2, name: '默认模型' })
    await user.click(screen.getByRole('button', { name: '编辑 Zhipu' }))
    await user.clear(screen.getByRole('combobox', { name: '模型 1 上下文窗口' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('模型上下文窗口必须是正整数')).toBeInTheDocument()
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
    expect(claudeMock.updateProvider).not.toHaveBeenCalled()
  })

  it('restores focus to the edit trigger when the editor is dismissed with Escape', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '默认模型' })
    const editButton = screen.getByRole('button', { name: '编辑 Zhipu' })
    await user.click(editButton)
    await screen.findByRole('dialog')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    await waitFor(() => {
      expect(editButton).toHaveFocus()
    })
  })

  it('does not restore focus to the edit trigger when the editor is dismissed with the pointer', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '默认模型' })
    const editButton = screen.getByRole('button', { name: '编辑 Zhipu' })
    await user.click(editButton)
    await screen.findByRole('dialog')

    await user.click(document.body)
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(editButton).not.toHaveFocus()
  })
})
