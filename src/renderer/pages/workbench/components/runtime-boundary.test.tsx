import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClaudeRuntimeState } from '@/shared/claude-runtime'

import { useClaudeRuntimeStore } from '../../../stores/claude-runtime-store'
import { ClaudeRuntimeBoundary } from './runtime-boundary'

vi.mock('../../../services/desktop/client', () => ({ isDesktopRuntime: () => true }))
vi.mock('../../../components/claude-runtime', () => ({
  ClaudeRuntimePanel: () => <div data-testid="runtime-onboarding" />,
}))
vi.mock('./loading-state', () => ({
  WorkbenchStartupLoading: () => <div data-testid="startup-loading" />,
}))

const ready: ClaudeRuntimeState = {
  phase: 'ready',
  minimumVersion: '2.1.0',
  version: '2.1.0',
  customPath: '',
  path: '/user/claude',
  installPath: '/user/claude',
  logs: '',
}

beforeEach(() => {
  useClaudeRuntimeStore.setState({
    ...useClaudeRuntimeStore.getInitialState(),
    initialize: vi.fn(async () => {}),
  })
})

describe('runtime startup surface', () => {
  it.each(['missing', 'outdated', 'failed', 'ready'] as const)(
    'shows the repair or continue surface for %s after initialization',
    (phase) => {
      useClaudeRuntimeStore.setState({ runtime: { ...ready, phase }, isInitializing: false })
      render(
        <ClaudeRuntimeBoundary>
          <div data-testid="workbench" />
        </ClaudeRuntimeBoundary>,
      )
      expect(screen.getByTestId('runtime-onboarding')).toBeInTheDocument()
      expect(screen.queryByTestId('workbench')).not.toBeInTheDocument()
    },
  )

  it('shows a recovery action when the initial request fails', () => {
    useClaudeRuntimeStore.setState({ requestError: 'IPC unavailable', isInitializing: false })
    render(
      <ClaudeRuntimeBoundary>
        <div data-testid="workbench" />
      </ClaudeRuntimeBoundary>,
    )
    expect(screen.getByTestId('runtime-onboarding')).toBeInTheDocument()
  })
  it('keeps onboarding hidden until the initial runtime check finishes', () => {
    render(
      <ClaudeRuntimeBoundary>
        <div data-testid="workbench" />
      </ClaudeRuntimeBoundary>,
    )
    expect(screen.queryByTestId('runtime-onboarding')).not.toBeInTheDocument()
    expect(screen.getByTestId('startup-loading')).toBeInTheDocument()
    act(() => useClaudeRuntimeStore.setState({ runtime: { ...ready, phase: 'checking' } }))
    expect(screen.queryByTestId('runtime-onboarding')).not.toBeInTheDocument()
    // Main may publish ready before the initial RPC response returns.
    act(() => useClaudeRuntimeStore.setState({ runtime: ready }))
    expect(screen.queryByTestId('runtime-onboarding')).not.toBeInTheDocument()
    act(() => useClaudeRuntimeStore.setState({ hasContinued: true }))
    expect(screen.getByTestId('workbench')).toBeInTheDocument()
  })

  it('keeps the workbench mounted during later background checks', () => {
    useClaudeRuntimeStore.setState({ runtime: { ...ready, phase: 'checking' }, hasContinued: true })
    render(
      <ClaudeRuntimeBoundary>
        <div data-testid="workbench" />
      </ClaudeRuntimeBoundary>,
    )
    expect(screen.getByTestId('workbench')).toBeInTheDocument()
    expect(screen.queryByTestId('runtime-onboarding')).not.toBeInTheDocument()
  })
})
