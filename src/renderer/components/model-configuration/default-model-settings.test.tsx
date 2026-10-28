import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ClaudeModelRoleMapping } from '@/shared/rpc'

import type { ModelProvider } from '../../services/claude/claude'
import { DefaultModelSettings } from './default-model-settings'

const providers: ModelProvider[] = [
  {
    id: 'zhipu',
    name: 'Zhipu',
    baseURL: 'https://open.bigmodel.cn/api/anthropic',
    authToken: 'secret',
    models: [
      { id: 'glm-5.2', displayName: 'GLM 5.2', contextWindow: 200000 },
      { id: 'glm-4.7', displayName: 'GLM 4.7', contextWindow: 128000 },
    ],
  },
]

function renderSettings({
  modelMappings = {},
  onSaveMappings = vi.fn(async (mappings: ClaudeModelRoleMapping) => mappings),
}: {
  modelMappings?: ClaudeModelRoleMapping
  onSaveMappings?: (mappings: ClaudeModelRoleMapping) => Promise<ClaudeModelRoleMapping>
} = {}) {
  const onSave = vi.fn(async (model: string | null) => model)
  render(
    <DefaultModelSettings
      model={null}
      modelMappings={modelMappings}
      providers={providers}
      onSave={onSave}
      onSaveMappings={onSaveMappings}
    />,
  )
  return { onSave, onSaveMappings }
}

describe('DefaultModelSettings role mappings', () => {
  it('saves the picked model as the haiku mapping', async () => {
    const onSaveMappings = vi.fn(async (mappings: ClaudeModelRoleMapping) => mappings)
    renderSettings({ onSaveMappings })

    await userEvent.click(screen.getByRole('button', { name: /Haiku/i }))
    await userEvent.click(await screen.findByText('GLM 4.7'))

    await waitFor(() => {
      expect(onSaveMappings).toHaveBeenCalledWith({ haiku: 'zhipu/glm-4.7' })
    })
  })

  it('clears the haiku mapping via the clear control', async () => {
    const onSaveMappings = vi.fn(async (mappings: ClaudeModelRoleMapping) => mappings)
    renderSettings({ modelMappings: { haiku: 'zhipu/glm-5.2' }, onSaveMappings })

    const picker = document.getElementById('settings-model-mapping-haiku')
    expect(picker).not.toBeNull()
    await userEvent.hover(picker as Element)
    const clear = (picker as Element).querySelector('[data-slot="mapping-clear"]')
    expect(clear).not.toBeNull()
    await userEvent.click(clear as Element)

    await waitFor(() => {
      expect(onSaveMappings).toHaveBeenCalledWith({})
    })
  })

  it('fills every role with the chosen model', async () => {
    const onSaveMappings = vi.fn(async (mappings: ClaudeModelRoleMapping) => mappings)
    renderSettings({ onSaveMappings })

    await userEvent.click(screen.getByRole('button', { name: '一键设置所有角色模型' }))
    await userEvent.click(await screen.findByText('GLM 5.2'))

    await waitFor(() => {
      expect(onSaveMappings).toHaveBeenCalledWith({
        haiku: 'zhipu/glm-5.2',
        sonnet: 'zhipu/glm-5.2',
        opus: 'zhipu/glm-5.2',
      })
    })
  })
})
