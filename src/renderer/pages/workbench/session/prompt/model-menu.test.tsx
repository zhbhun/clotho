import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/shadcn/tooltip'

import { initializeAppI18n } from '../../../../i18n/runtime'
import type { ClaudeModelInfo, ProviderUsageQuota } from '../../../../services/claude/claude'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../../services/shortcuts/runtime'
import { ModelConfigurationProvider } from '../../../../stores/model-configuration-context'
import {
  ProviderUsageProvider,
  useProviderUsageStoreApi,
} from '../../../../stores/provider-usage-context'
import { PromptComposer } from './index'

// Mirrors the authenticated Claude rows the SDK reports: the `default` alias first,
// with a description naming the concrete model it currently resolves to.
const CLAUDE_MODEL_OPTIONS: ClaudeModelInfo[] = [
  {
    value: 'default',
    displayName: 'Default',
    description: 'Balanced model for everyday tasks (default: Sonnet 4.6)',
    providerId: 'claude',
    providerName: 'Claude',
  },
  {
    value: 'claude-opus-4-8',
    displayName: 'Opus 4.8',
    description: 'Powerful, large context window',
    providerId: 'claude',
    providerName: 'Claude',
  },
  {
    value: 'claude-sonnet-4-6',
    displayName: 'Sonnet 4.6',
    description: 'Balanced model for everyday tasks',
    providerId: 'claude',
    providerName: 'Claude',
  },
  {
    value: 'claude-haiku-4-7',
    displayName: 'Haiku 4.7',
    description: 'Fastest model',
    providerId: 'claude',
    providerName: 'Claude',
  },
]

const baseProps = {
  attachments: [],
  availableCommands: [],
  canSubmit: false,
  canUsePrompt: true,
  contextUsage: null,
  isMockProject: false,
  isStreaming: false,
  model: 'default',
  modelOptions: CLAUDE_MODEL_OPTIONS,
  permissionMode: 'bypassPermissions' as const,
  prompt: '',
  selectedModelLabel: 'Default',
  selectedProviderId: 'claude',
  setPermissionMode: () => undefined,
  setPrompt: () => undefined,
  setAttachments: () => undefined,
  setSelectedProviderModel: () => undefined,
  slashMenuPlacement: 'below' as const,
  onSelectFiles: async () => [],
  onStop: () => undefined,
  onSubmit: () => undefined,
}

/** Drops a cached quota into the shared usage store; must render inside ProviderUsageProvider. */
function SeedProviderUsage({
  providerId,
  quota,
}: {
  providerId: string
  quota: ProviderUsageQuota
}) {
  const store = useProviderUsageStoreApi()
  useEffect(() => {
    store.setState({ usage: { [providerId]: quota } })
  }, [providerId, quota, store])
  return null
}

function renderComposer(props: Partial<Parameters<typeof PromptComposer>[0]> = {}) {
  return render(
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <ModelConfigurationProvider>
        <ProviderUsageProvider>
          <TooltipProvider>
            <PromptComposer {...baseProps} {...props} />
          </TooltipProvider>
        </ProviderUsageProvider>
      </ModelConfigurationProvider>
    </ShortcutRuntimeProvider>,
  )
}

async function openModelMenu(triggerName: RegExp, optionName: string) {
  const user = userEvent.setup()
  // The trigger has no aria-label; its accessible name is the resolved model name.
  await user.click(screen.getByRole('button', { name: triggerName }))
  await screen.findByRole('option', { name: optionName })
  return user
}

// Assertions in this suite expect the English catalog; the global setup resets to zh-CN.
beforeEach(async () => {
  await initializeAppI18n('en', ['en-US'])
})

describe('prompt composer model menu', () => {
  it('shows the concrete model behind the default alias on the trigger', () => {
    renderComposer()

    expect(screen.getByRole('button', { name: /Sonnet 4\.6/ })).toBeInTheDocument()
  })

  it('checks and highlights the current model when the effective model is the default alias', async () => {
    renderComposer()
    await openModelMenu(/Sonnet 4\.6/, 'Sonnet 4.6')

    const currentModelItem = screen.getByRole('option', { name: 'Sonnet 4.6' })

    await waitFor(() => {
      expect(currentModelItem).toHaveAttribute('aria-selected', 'true')
    })
    expect(currentModelItem).toHaveAttribute('data-checked', 'true')
  })

  it('checks and highlights an explicitly selected model', async () => {
    renderComposer({
      model: 'claude-haiku-4-7',
      selectedModelLabel: 'Haiku 4.7',
    })
    await openModelMenu(/Haiku 4\.7/, 'Haiku 4.7')

    const currentModelItem = screen.getByRole('option', { name: 'Haiku 4.7' })

    await waitFor(() => {
      expect(currentModelItem).toHaveAttribute('aria-selected', 'true')
    })
    expect(currentModelItem).toHaveAttribute('data-checked', 'true')
  })

  it('shows remaining quota next to the provider group heading', async () => {
    render(
      <ShortcutRuntimeProvider runtime={shortcutRuntime}>
        <ModelConfigurationProvider>
          <ProviderUsageProvider>
            <SeedProviderUsage
              providerId="claude"
              quota={{
                success: true,
                queriedAt: Date.now(),
                windows: [{ name: 'fiveHour', utilization: 23, resetsAt: null }],
              }}
            />
            <TooltipProvider>
              <PromptComposer {...baseProps} />
            </TooltipProvider>
          </ProviderUsageProvider>
        </ModelConfigurationProvider>
      </ShortcutRuntimeProvider>,
    )
    await openModelMenu(/Sonnet 4\.6/, 'Sonnet 4.6')

    // A percentage window renders as one concentric ring: track + remaining arc.
    const ringCircles = document.querySelectorAll('[data-slot="menu-label"] svg circle')
    expect(ringCircles.length).toBe(2)

    // The arc fills with the remaining share: 100 - 23 utilization leaves 77%.
    const circumference = 2 * Math.PI * 7
    expect(Number(ringCircles[1].getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * 0.23,
      3,
    )
  })

  it('highlights the current permission mode and moves the same highlight on hover', async () => {
    renderComposer({ permissionMode: 'plan' })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Permission mode' }))
    await screen.findByRole('option', { name: /Plan mode/ })

    const planItem = screen.getByRole('option', { name: /Plan mode/ })

    await waitFor(() => {
      expect(planItem).toHaveAttribute('aria-selected', 'true')
    })
    expect(planItem).toHaveAttribute('data-checked', 'true')

    // Hover moves the same highlight; the check stays on the current mode.
    fireEvent.pointerMove(screen.getByRole('option', { name: /Full access/ }))

    expect(screen.getByRole('option', { name: /Full access/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(planItem).toHaveAttribute('aria-selected', 'false')
    expect(planItem).toHaveAttribute('data-checked', 'true')
  })
})
