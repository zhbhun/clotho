import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'

import { appI18n } from '../../i18n/runtime'
import type { ModelProvider } from '../../services/claude/claude'
import { DefaultModelSettings } from './default-model-settings'

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

/** The picker trigger's accessible name comes from the field label. */
function pickerTrigger() {
  return screen.getByRole('button', { name: '默认模型' })
}

function pickerClear() {
  const clear = pickerTrigger().querySelector("[data-slot='mapping-clear']")
  if (!(clear instanceof Element)) throw new Error('clear icon not found')
  return clear
}

describe('DefaultModelSettings', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
  })

  it('automatically saves a default model selected from grouped providers', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (model: string | null): Promise<string | null> => model)

    render(<DefaultModelSettings providers={PROVIDERS} model="zhipu/glm-5.2" onSave={onSave} />)

    expect(pickerTrigger()).toHaveTextContent('Zhipu · GLM-5.2')

    await user.click(pickerTrigger())
    await user.click(await screen.findByText('K3 Long'))

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('kimi/k3/long'))
    expect(pickerTrigger()).toHaveTextContent('Kimi · K3 Long')
  })

  it('saves null when the default model is cleared from the trigger hover icon', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(async (model: string | null): Promise<string | null> => model)

    render(<DefaultModelSettings providers={PROVIDERS} model="zhipu/glm-5.2" onSave={onSave} />)

    await user.click(pickerClear())

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(null))
    expect(pickerTrigger()).toHaveTextContent('未配置')
    expect(document.querySelector("[data-slot='menu-content']")).toBeNull()
  })

  it('disables the picker while saving, restores on failure, and allows retrying', async () => {
    const user = userEvent.setup()
    let rejectSave: (reason: Error) => void = () => undefined
    const onSave = vi
      .fn<(model: string | null) => Promise<string | null>>()
      .mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            rejectSave = reject
          }),
      )
      .mockImplementation(async (model) => model)

    render(
      <Toaster>
        <DefaultModelSettings providers={PROVIDERS} model="zhipu/glm-5.2" onSave={onSave} />
      </Toaster>,
    )

    await user.click(pickerTrigger())
    await user.click(await screen.findByText('GLM-4.7'))

    expect(pickerTrigger()).toBeDisabled()

    await act(async () => {
      rejectSave(new Error('Unable to write settings'))
    })

    expect(await screen.findByText('默认模型保存失败，请重试')).toBeInTheDocument()
    expect(pickerTrigger()).toBeEnabled()
    expect(pickerTrigger()).toHaveTextContent('Zhipu · GLM-5.2')

    await user.click(pickerTrigger())
    await user.click(await screen.findByText('GLM-4.7'))

    await waitFor(() => expect(onSave).toHaveBeenNthCalledWith(2, 'zhipu/glm-4.7'))
    expect(pickerTrigger()).toHaveTextContent('Zhipu · GLM-4.7')
  })
})
