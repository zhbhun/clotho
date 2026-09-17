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
  listModelMappings: vi.fn(),
  listProviders: vi.fn(),
  saveModelMappings: vi.fn(),
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
    authField: 'ANTHROPIC_AUTH_TOKEN',
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
    claudeMock.listModelMappings.mockResolvedValue({ sonnet: 'zhipu/glm-5.2' })
    claudeMock.saveModelMappings.mockImplementation(async (models) => models)
    claudeMock.createProvider.mockImplementation(async (provider) => provider)
    claudeMock.updateProvider.mockImplementation(async (provider) => provider)
  })

  it('loads and automatically saves global model mappings from the settings service', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    expect(await screen.findByRole('heading', { level: 2, name: '映射' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '供应商' })).toBeInTheDocument()
    expect(claudeMock.listProviders).toHaveBeenCalledOnce()
    expect(claudeMock.listModelMappings).toHaveBeenCalledOnce()

    await user.click(screen.getByRole('combobox', { name: 'Haiku' }))
    await user.click(await screen.findByText('GLM-5.2'))

    await waitFor(() =>
      expect(claudeMock.saveModelMappings).toHaveBeenCalledWith({
        sonnet: 'zhipu/glm-5.2',
        haiku: 'zhipu/glm-5.2',
      }),
    )
  })

  it('prevents saving a provider with an invalid model context window', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(
      <Toaster>
        <ProviderSettings />
      </Toaster>,
    )

    await screen.findByRole('heading', { level: 2, name: '映射' })
    await user.click(screen.getByRole('button', { name: '编辑 Zhipu' }))
    await user.clear(screen.getByRole('combobox', { name: '模型 1 上下文窗口' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('模型上下文窗口必须是正整数')).toBeInTheDocument()
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
    expect(claudeMock.updateProvider).not.toHaveBeenCalled()
  })

  it('requires a user-configured provider id when creating a provider', async () => {
    const user = userEvent.setup()
    claudeMock.listProviders.mockResolvedValue([])

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByText('尚未添加供应商')
    await user.click(screen.getByRole('button', { name: '新增供应商' }))
    expect(screen.getByRole('combobox', { name: '供应商' })).toHaveValue('')

    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('请输入供应商')
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
  })

  it('trims and creates a provider with a valid unique id', async () => {
    const user = userEvent.setup()
    claudeMock.listProviders.mockResolvedValue([])

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByText('尚未添加供应商')
    await user.click(screen.getByRole('button', { name: '新增供应商' }))
    await user.type(screen.getByRole('combobox', { name: '供应商' }), '  custom-provider  ')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(claudeMock.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'custom-provider' }),
      ),
    )
    expect(claudeMock.updateProvider).not.toHaveBeenCalled()
  })

  it('uses an editable stable preset id until the provider is first saved', async () => {
    const user = userEvent.setup()
    claudeMock.listProviders.mockResolvedValue([])

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByText('尚未添加供应商')
    await user.click(screen.getByRole('button', { name: '从预设添加' }))
    await user.click(await screen.findByRole('option', { name: 'Zhipu GLM' }))

    const idInput = screen.getByRole('combobox', { name: '供应商' })
    expect(idInput).toHaveValue('zhipu-glm')
    expect(idInput).not.toHaveAttribute('readonly')

    await user.clear(idInput)
    await user.type(idInput, 'zhipu-glm-custom')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(claudeMock.createProvider).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'zhipu-glm-custom', presetId: 'zhipu-glm' }),
      ),
    )
  })

  it('rejects an invalid provider id before creating', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '映射' })
    await user.click(screen.getByRole('button', { name: '新增供应商' }))
    const idInput = screen.getByRole('combobox', { name: '供应商' })
    await user.type(idInput, 'Invalid')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '仅允许小写字母、数字、.、_、-，且必须以字母或数字开头',
    )
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
  })

  it('rejects a duplicate provider id before creating', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '映射' })
    await user.click(screen.getByRole('button', { name: '新增供应商' }))
    const idInput = screen.getByRole('combobox', { name: '供应商' })
    await user.type(idInput, 'zhipu')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Provider ID 已存在')
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
  })

  it('keeps an existing provider id read-only and updates the provider', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '映射' })
    await user.click(screen.getByRole('button', { name: '编辑 Zhipu' }))
    expect(screen.getByRole('textbox', { name: '供应商' })).toHaveAttribute('readonly')

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(claudeMock.updateProvider).toHaveBeenCalledWith(PROVIDERS[0]))
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
  })

  it('restores focus to the edit trigger when the editor is dismissed with Escape', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '映射' })
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

    await screen.findByRole('heading', { level: 2, name: '映射' })
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
