import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'

import { appI18n } from '../../i18n/runtime'
import type { ClaudeModelMappings, ModelProvider } from '../../services/claude/claude'
import { ModelMappingSettings } from './model-mapping-settings'

const PROVIDERS: ModelProvider[] = [
  {
    id: 'zhipu',
    name: 'Zhipu',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    authToken: 'secret',
    models: [
      { id: 'glm-5.2', displayName: 'GLM-5.2', contextWindow: 200_000 },
      { id: 'glm-4.7', displayName: 'GLM-4.7', contextWindow: 128_000 },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    baseURL: 'https://api.moonshot.cn/anthropic',
    authToken: 'secret',
    models: [{ id: 'k3/long', displayName: 'K3 Long', contextWindow: 256_000 }],
  },
]

function pickerInput(label: string) {
  return screen.getByRole('combobox', { name: label })
}

function pickerClear(label: string) {
  const clear = pickerInput(label)
    .closest("[data-slot='input-group']")
    ?.querySelector("[data-slot='combobox-clear']")
  if (!(clear instanceof HTMLElement)) throw new Error(`clear button not found for ${label}`)
  return clear
}

describe('ModelMappingSettings', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
  })

  it('automatically saves a partial model mapping selected from grouped providers', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(
      async (models: ClaudeModelMappings): Promise<ClaudeModelMappings> => models,
    )

    render(
      <ModelMappingSettings
        providers={PROVIDERS}
        models={{ sonnet: 'zhipu/glm-5.2' }}
        onSave={onSave}
      />,
    )

    await user.click(pickerInput('Haiku'))
    await user.click(await screen.findByText('K3 Long'))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        sonnet: 'zhipu/glm-5.2',
        haiku: 'kimi/k3/long',
      }),
    )
    expect(screen.queryByRole('button', { name: '保存映射' })).not.toBeInTheDocument()
  })

  it('automatically saves when an existing mapping is cleared', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(
      async (models: ClaudeModelMappings): Promise<ClaudeModelMappings> => models,
    )

    render(
      <ModelMappingSettings
        providers={PROVIDERS}
        models={{ sonnet: 'zhipu/glm-5.2' }}
        onSave={onSave}
      />,
    )

    await user.click(pickerClear('Sonnet'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({}))
  })

  it('automatically saves after filling all six roles with one selected model', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(
      async (models: ClaudeModelMappings): Promise<ClaudeModelMappings> => models,
    )

    render(<ModelMappingSettings providers={PROVIDERS} models={{}} onSave={onSave} />)

    await user.click(screen.getByRole('button', { name: '一键设置所有模型' }))
    await user.click(await screen.findByText('K3 Long'))

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        sonnet: 'kimi/k3/long',
        opus: 'kimi/k3/long',
        fable: 'kimi/k3/long',
        haiku: 'kimi/k3/long',
        subagent: 'kimi/k3/long',
        fallback: 'kimi/k3/long',
      }),
    )
  })

  it('disables controls while saving, restores on failure, and allows retrying', async () => {
    const user = userEvent.setup()
    let rejectSave: (reason: Error) => void = () => undefined
    const onSave = vi
      .fn<(models: ClaudeModelMappings) => Promise<ClaudeModelMappings>>()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSave = reject
          }),
      )
      .mockImplementation(async (models) => models)

    render(
      <Toaster>
        <ModelMappingSettings
          providers={PROVIDERS}
          models={{ sonnet: 'zhipu/glm-5.2' }}
          onSave={onSave}
        />
      </Toaster>,
    )

    const sonnetPicker = pickerInput('Sonnet')
    await user.click(pickerClear('Sonnet'))

    expect(sonnetPicker).toBeDisabled()
    expect(screen.getByRole('button', { name: '一键设置所有模型' })).toBeDisabled()

    await act(async () => {
      rejectSave(new Error('Unable to write settings'))
    })

    expect(await screen.findByText('模型映射保存失败，请重试')).toBeInTheDocument()
    expect(sonnetPicker).toHaveValue('Zhipu · GLM-5.2')
    expect(sonnetPicker).toBeEnabled()
    expect(screen.queryByRole('button', { name: '保存映射' })).not.toBeInTheDocument()

    await user.click(pickerClear('Sonnet'))

    await waitFor(() => expect(onSave).toHaveBeenNthCalledWith(2, {}))
    expect(sonnetPicker).toHaveValue('')
  })
})
