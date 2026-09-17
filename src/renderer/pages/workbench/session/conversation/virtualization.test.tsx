import { render, screen } from '@testing-library/react'
import { type ComponentProps, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ConversationView } from '.'
import type { ClaudeMessage } from '../services/message'
import { SubagentConversation } from '../subagent-conversation'

function mainMessages(count: number): ClaudeMessage[] {
  return Array.from({ length: count }, (_, index) => [
    { id: `user-${index}`, role: 'user' as const, content: `Question ${index}` },
    {
      id: `assistant-${index}`,
      role: 'assistant' as const,
      content: `Answer ${index}`,
      blocks: [{ type: 'text' as const, text: `Answer ${index}` }],
    },
  ]).flat()
}

function subagentMessages(count: number): ClaudeMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `assistant-${index}`,
    role: 'assistant' as const,
    content: `Agent item ${index}`,
    blocks: [{ type: 'text' as const, text: `Agent item ${index}` }],
  }))
}

function MainHarness({ messages }: { messages: ClaudeMessage[] }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const VirtualConversationView = ConversationView as React.ComponentType<
    ComponentProps<typeof ConversationView> & { viewport: HTMLDivElement | null }
  >

  return (
    <div data-testid="conversation-viewport" ref={setViewport}>
      <VirtualConversationView
        expandedTurns={{}}
        isStreaming={false}
        messages={messages}
        pendingRequests={{}}
        sentTurnIds={new Set()}
        streamingElapsed={0}
        viewport={viewport}
        onRespond={vi.fn()}
        onToggle={vi.fn()}
      />
    </div>
  )
}

function SubagentHarness({ messages }: { messages: ClaudeMessage[] }) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null)
  const VirtualSubagentConversation = SubagentConversation as React.ComponentType<
    ComponentProps<typeof SubagentConversation> & { viewport: HTMLDivElement | null }
  >

  return (
    <div data-testid="conversation-viewport" ref={setViewport}>
      <VirtualSubagentConversation
        error={null}
        isLoading={false}
        messages={messages}
        status="completed"
        viewport={viewport}
        onOpenSubagent={vi.fn()}
        onRetry={vi.fn()}
      />
    </div>
  )
}

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'conversation-viewport' ? 300 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'conversation-viewport' ? 800 : 0
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'conversation-viewport' ? 300 : 80
  })
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'conversation-viewport' ? 800 : 800
  })
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    return this.dataset.testid === 'conversation-viewport' ? 20_000 : 0
  })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    return this instanceof HTMLElement && this.dataset.testid === 'conversation-viewport'
      ? new DOMRect(0, 0, 800, 300)
      : new DOMRect(0, 0, 800, 80)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('conversation virtualization', () => {
  it('windows main-conversation rows', () => {
    render(<MainHarness messages={mainMessages(100)} />)

    const mountedTurns = document.querySelectorAll('[data-conversation-turn-id]')
    expect(mountedTurns.length).toBeGreaterThan(0)
    expect(mountedTurns.length).toBeLessThan(100)
  })

  it('windows subagent timeline rows', () => {
    render(<SubagentHarness messages={subagentMessages(100)} />)

    const mountedRows = document.querySelectorAll('[data-conversation-virtual-row]')
    expect(mountedRows.length).toBeGreaterThan(0)
    expect(mountedRows.length).toBeLessThan(100)
    expect(screen.getByText('Agent item 0')).toBeInTheDocument()
  })
})
