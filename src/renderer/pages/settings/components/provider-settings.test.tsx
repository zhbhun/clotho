import { render, screen, waitFor } from '@testing-library/react'
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
import { useSettingsDetailStore } from './settings-detail-store'

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
    useSettingsDetailStore.setState({ view: { kind: 'list' }, isDirty: false, leaf: '' })
  })

  it('loads and automatically saves the default model from the settings service', async () => {
    const user = userEvent.setup()
    claudeMock.getDefaultModel.mockResolvedValue(null)

    renderWithShortcuts(<ProviderSettings />)

    expect(await screen.findByRole('heading', { level: 2, name: '模型映射' })).toBeInTheDocument()
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

    await screen.findByRole('heading', { level: 2, name: '模型映射' })
    await user.click(screen.getByRole('button', { name: '编辑 Zhipu' }))
    await user.clear(screen.getByRole('combobox', { name: '模型 1 上下文窗口' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('模型上下文窗口必须是正整数')).toBeInTheDocument()
    expect(claudeMock.createProvider).not.toHaveBeenCalled()
    expect(claudeMock.updateProvider).not.toHaveBeenCalled()
    expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
  })

  it('opens the editor as a detail page with a breadcrumb and returns to the list on save', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '模型映射' })
    await user.click(screen.getByRole('button', { name: '编辑 Zhipu' }))

    // The list section is replaced by the detail page; the store leaf carries
    // the action label for the page shell's breadcrumb bar.
    expect(screen.queryByRole('heading', { level: 2, name: '供应商' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '编辑供应商' })).toBeInTheDocument()
    expect(useSettingsDetailStore.getState().view).toMatchObject({
      kind: 'detail',
      categoryId: 'models',
      file: 'zhipu',
    })
    expect(useSettingsDetailStore.getState().leaf).toBe('编辑供应商')

    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(claudeMock.updateProvider).toHaveBeenCalledOnce())
    expect(useSettingsDetailStore.getState().view.kind).toBe('list')
    expect(await screen.findByRole('heading', { level: 2, name: '供应商' })).toBeInTheDocument()
  })

  it('gates a dirty detail page behind the discard dialog via Cancel', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '模型映射' })
    await user.click(screen.getByRole('button', { name: '编辑 Zhipu' }))
    await user.type(screen.getByRole('textbox', { name: '名称' }), '-x')

    await user.click(screen.getByRole('button', { name: '取消' }))

    // The shared leave gate opens the pending dialog in the page shell; the
    // detail page stays open until the dialog resolves.
    await waitFor(() => expect(useSettingsDetailStore.getState().isLeavePending).toBe(true))
    expect(useSettingsDetailStore.getState().view.kind).toBe('detail')
    expect(claudeMock.updateProvider).not.toHaveBeenCalled()

    // Resolve the gate so it does not leak into the next test.
    useSettingsDetailStore.getState().confirmLeave()
    expect(useSettingsDetailStore.getState().view.kind).toBe('list')
  })

  it('returns to the list directly from a clean Cancel', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(<ProviderSettings />)

    await screen.findByRole('heading', { level: 2, name: '模型映射' })
    await user.click(screen.getByRole('button', { name: '编辑 Zhipu' }))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(await screen.findByRole('heading', { level: 2, name: '供应商' })).toBeInTheDocument()
    expect(useSettingsDetailStore.getState().view.kind).toBe('list')
  })
})
