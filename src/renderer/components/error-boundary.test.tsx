import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ErrorBoundary } from './error-boundary'

function BrokenContent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('Render failed')
  return <div>Recovered content</div>
}

describe('ErrorBoundary', () => {
  afterEach(() => vi.restoreAllMocks())

  it('isolates a render failure and resets when its reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { rerender } = render(
      <ErrorBoundary fallback={<div>Section unavailable</div>} resetKeys={['session-a']}>
        <BrokenContent shouldThrow />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Section unavailable')).toBeInTheDocument()

    rerender(
      <ErrorBoundary fallback={<div>Section unavailable</div>} resetKeys={['session-b']}>
        <BrokenContent shouldThrow={false} />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Recovered content')).toBeInTheDocument()
  })
})
