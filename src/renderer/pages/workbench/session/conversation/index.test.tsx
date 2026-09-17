import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps, ComponentType } from 'react'
import { afterEach, expect, it, vi } from 'vitest'

import { ConversationView } from '.'
import { initializeAppI18n } from '../../../../i18n/runtime'
import type { ClaudeSessionEditAnchor } from '../../../../services/claude/claude'
import { commandCatalog } from '../../../../services/shortcuts/catalog'
import {
  ShortcutRuntimeProvider,
  createShortcutRuntime,
} from '../../../../services/shortcuts/runtime'
import { ModelConfigurationProvider } from '../../../../stores/model-configuration-context'
import { ProviderUsageProvider } from '../../../../stores/provider-usage-context'
import type { MessageEditConfig } from './historical-message-editor'

const timelineRenderState = vi.hoisted(() => ({ shouldThrow: false }))

vi.mock('./timeline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./timeline')>()
  return {
    ...actual,
    TimelineEntry: (props: ComponentProps<typeof actual.TimelineEntry>) => {
      if (timelineRenderState.shouldThrow) throw new Error('Agent reply render failed')
      return <actual.TimelineEntry {...props} />
    },
  }
})

afterEach(() => {
  timelineRenderState.shouldThrow = false
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('renders the approved Chinese turn status wording', async () => {
  await initializeAppI18n('zh-CN', ['zh-CN'])
  const onRespond = vi.fn()
  const onToggle = vi.fn()

  const { rerender } = render(
    <ConversationView
      expandedTurns={{}}
      isStreaming={false}
      messages={[
        {
          id: 'user-1',
          role: 'user',
          content: 'continue',
          timestamp: '2026-08-27T10:00:00.000Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Done',
          blocks: [{ type: 'text', text: 'Done' }],
          timestamp: '2026-08-27T10:00:12.000Z',
        },
      ]}
      pendingRequests={{}}
      sentTurnIds={new Set(['user-1'])}
      streamingElapsed={0}
      onRespond={onRespond}
      onToggle={onToggle}
    />,
  )

  expect(screen.getByText('已完成')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '已完成' })).not.toBeInTheDocument()

  rerender(
    <ConversationView
      expandedTurns={{}}
      isStreaming={false}
      messages={[{ id: 'user-2', role: 'user', content: 'continue' }]}
      pendingRequests={{}}
      sentTurnIds={new Set(['user-2'])}
      streamingElapsed={0}
      turnFailures={{ 'user-2': { elapsed: 12, message: 'model offline' } }}
      onRespond={onRespond}
      onToggle={onToggle}
    />,
  )

  expect(screen.getByText('在 12 秒后出错了')).toBeInTheDocument()
  expect(screen.getByText('model offline')).toBeInTheDocument()

  rerender(
    <ConversationView
      expandedTurns={{}}
      isStreaming
      messages={[{ id: 'user-3', role: 'user', content: 'continue' }]}
      pendingRequests={{}}
      sentTurnIds={new Set(['user-3'])}
      streamingElapsed={12}
      onRespond={onRespond}
      onToggle={onToggle}
    />,
  )
  expect(screen.getByText('思考中…')).toBeInTheDocument()

  rerender(
    <ConversationView
      expandedTurns={{}}
      isStreaming
      messages={[
        { id: 'user-4', role: 'user', content: 'continue' },
        {
          id: 'assistant-4',
          role: 'assistant',
          content: 'Partial',
          blocks: [{ type: 'text', text: 'Partial' }],
        },
      ]}
      pendingRequests={{}}
      sentTurnIds={new Set(['user-4'])}
      streamingElapsed={12}
      onRespond={onRespond}
      onToggle={onToggle}
    />,
  )
  expect(screen.getByText('工作中')).toBeInTheDocument()

  rerender(
    <ConversationView
      expandedTurns={{}}
      interruptedTurnDurations={{ 'user-5': 12 }}
      interruptedTurnIds={new Set(['user-5'])}
      isStreaming={false}
      messages={[{ id: 'user-5', role: 'user', content: 'continue' }]}
      pendingRequests={{}}
      sentTurnIds={new Set(['user-5'])}
      streamingElapsed={0}
      onRespond={onRespond}
      onToggle={onToggle}
    />,
  )
  expect(screen.getByText('你在 12 秒后停止了')).toBeInTheDocument()
})

it('isolates an Agent reply rendering failure below its user message', async () => {
  await initializeAppI18n('zh-CN', ['zh-CN'])
  timelineRenderState.shouldThrow = true
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  render(
    <ConversationView
      expandedTurns={{ 'user-1': true }}
      isStreaming
      messages={[
        { id: 'user-1', role: 'user', content: 'continue' },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '',
          blocks: [
            {
              type: 'tool_use',
              name: 'Read',
              toolUseId: 'tool-1',
              input: { file_path: 'README.md' },
            },
          ],
        },
      ]}
      pendingRequests={{}}
      sentTurnIds={new Set(['user-1'])}
      streamingElapsed={1}
      onRespond={vi.fn()}
      onToggle={vi.fn()}
    />,
  )

  expect(screen.getByText('continue')).toBeInTheDocument()
  expect(screen.getByText('Oops，出错了')).toBeInTheDocument()
  expect(consoleError).toHaveBeenCalled()
})

it('requires an explicit choice before rewinding files for a historical edit', async () => {
  await initializeAppI18n('en', ['en-US'])
  const user = userEvent.setup()
  const onPrepare = vi.fn(async () => ({
    status: 'confirm' as const,
    editTarget: {
      strategy: 'resume' as const,
      resumeSessionAt: 'parent-message-uuid',
    },
    preview: {
      canRewind: true,
      filesChanged: ['src/app.tsx'],
      insertions: 3,
      deletions: 1,
    },
  }))
  const onSubmit = vi
    .fn<
      (
        draft: unknown,
        editTarget: ClaudeSessionEditAnchor,
        rewindFiles: boolean,
      ) => Promise<boolean>
    >()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true)
  const messageEdit: MessageEditConfig = {
    availableCommands: [],
    modelOptions: [
      {
        value: 'glm-5.2',
        displayName: 'GLM-5.2',
        description: '',
        providerId: 'zhipu',
        providerName: 'Zhipu',
      },
    ],
    permissionMode: 'bypassPermissions',
    selectedModelId: 'glm-5.2',
    selectedProviderId: 'zhipu',
    onCancelPreparation: vi.fn(),
    onPrepare,
    onSelectFiles: vi.fn(async () => []),
    onSubmit,
  }
  const EditableConversation = ConversationView as ComponentType<
    Parameters<typeof ConversationView>[0] & { messageEdit?: MessageEditConfig }
  >

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      disconnect() {}
      observe() {}
    },
  )

  const shortcutRuntime = createShortcutRuntime({
    catalog: commandCatalog,
    client: {
      async load() {
        return {}
      },
      async reset() {
        return {}
      },
      async set() {
        return {}
      },
    },
    platform: 'mac',
  })

  render(
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>
      <ModelConfigurationProvider>
        <ProviderUsageProvider>
          <EditableConversation
            expandedTurns={{}}
            isStreaming={false}
            messageEdit={messageEdit}
            messages={[
              {
                id: 'user-1',
                uuid: 'user-message-uuid',
                role: 'user',
                content: 'Original prompt',
              },
              {
                id: 'assistant-1',
                uuid: 'assistant-message-uuid',
                role: 'assistant',
                content: 'Old reply',
                blocks: [{ type: 'text', text: 'Old reply' }],
              },
            ]}
            pendingRequests={{}}
            sentTurnIds={new Set()}
            streamingElapsed={0}
            onRespond={vi.fn()}
            onToggle={vi.fn()}
          />
        </ProviderUsageProvider>
      </ModelConfigurationProvider>
    </ShortcutRuntimeProvider>,
  )

  await user.click(screen.getByRole('button', { name: 'Edit user message' }))
  await user.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByRole('alertdialog')).toHaveTextContent('src/app.tsx')

  await user.click(screen.getByRole('button', { name: 'Send without reverting' }))
  expect(onSubmit).toHaveBeenLastCalledWith(
    expect.objectContaining({ messageUuid: 'user-message-uuid' }),
    { strategy: 'resume', resumeSessionAt: 'parent-message-uuid' },
    false,
  )

  await user.click(screen.getByRole('button', { name: 'Send' }))
  await screen.findByRole('alertdialog')
  await user.click(screen.getByRole('button', { name: 'Revert and send' }))
  expect(onSubmit).toHaveBeenLastCalledWith(
    expect.objectContaining({ messageUuid: 'user-message-uuid' }),
    { strategy: 'resume', resumeSessionAt: 'parent-message-uuid' },
    true,
  )
})
