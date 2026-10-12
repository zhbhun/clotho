import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { SubagentProgress } from './subagent-progress'
import type { SessionSubagent } from './subagents'

const running: SessionSubagent[] = [
  {
    id: 'agent-1',
    agentType: 'Explore',
    description: 'Locate outline rendering code',
    toolUseId: 'tool-1',
    spawnDepth: 1,
    createdAt: '2026-10-12T00:00:00.000Z',
    status: 'running',
  },
]

describe('SubagentProgress', () => {
  it('opens a running subagent from its row', async () => {
    const onOpen = vi.fn()
    render(<SubagentProgress onOpen={onOpen} running={running} stats={{ done: 0, total: 1 }} />)

    await userEvent.click(screen.getByText('0/1'))
    await userEvent.click(screen.getByText('Locate outline rendering code'))

    expect(onOpen).toHaveBeenCalledWith(running[0])
  })

  it('hides when no direct subagent is running', () => {
    render(<SubagentProgress running={[]} stats={{ done: 1, total: 1 }} />)

    expect(screen.queryByText('1/1')).not.toBeInTheDocument()
  })
})
