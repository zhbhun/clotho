import { Component, type ErrorInfo, type ReactNode } from 'react'

import { getLogger } from '../services/logging'

const logger = getLogger('render')

type ErrorBoundaryFallback = ReactNode | ((reset: () => void) => ReactNode)

type ErrorBoundaryProps = {
  children: ReactNode
  fallback: ErrorBoundaryFallback
  resetKeys?: readonly unknown[]
  onError?: (error: Error, info: ErrorInfo) => void
}

type ErrorBoundaryState = {
  error: Error | null
}

function didResetKeysChange(previous: readonly unknown[], next: readonly unknown[]) {
  return (
    previous.length !== next.length ||
    previous.some((value, index) => !Object.is(value, next[index]))
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('render.failed', 'A Clotho interface boundary caught an error', {
      componentStack: info.componentStack ?? undefined,
      context: { boundary: 'application' },
      error,
    })
    this.props.onError?.(error, info)
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (
      this.state.error &&
      didResetKeysChange(previousProps.resetKeys ?? [], this.props.resetKeys ?? [])
    ) {
      this.reset()
    }
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return typeof this.props.fallback === 'function'
      ? this.props.fallback(this.reset)
      : this.props.fallback
  }
}
