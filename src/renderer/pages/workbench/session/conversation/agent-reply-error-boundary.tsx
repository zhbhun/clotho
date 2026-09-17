import { Component, type ErrorInfo, type ReactNode } from 'react'

import { getLogger } from '../../../../services/logging'

const logger = getLogger('render')

type AgentReplyErrorBoundaryProps = {
  children: ReactNode
  fallback: string
}

type AgentReplyErrorBoundaryState = {
  hasError: boolean
}

export class AgentReplyErrorBoundary extends Component<
  AgentReplyErrorBoundaryProps,
  AgentReplyErrorBoundaryState
> {
  state: AgentReplyErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AgentReplyErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logger.error('render.failed', 'Failed to render an agent reply', {
      componentStack: info.componentStack ?? undefined,
      context: { boundary: 'agent-reply' },
      error,
    })
  }

  render() {
    if (this.state.hasError) {
      return <div className="px-3 pt-2 leading-6 text-destructive">{this.props.fallback}</div>
    }

    return this.props.children
  }
}
