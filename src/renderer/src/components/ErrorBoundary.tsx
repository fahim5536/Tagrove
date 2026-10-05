import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { ErrorScreen } from './ErrorScreen'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last-resort boundary for the whole renderer tree. Rendering errors show a
 * full-screen error screen instead of a white window; the report goes to the
 * main-process log through the preload bridge.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    void window.api?.log
      .write({
        level: 'error',
        message: `Renderer render error: ${error.message}`,
        context: { stack: error.stack ?? null, componentStack: info.componentStack ?? null },
      })
      .catch(() => {
        // The bridge itself is broken; nothing more we can report.
      })
  }

  override render(): ReactNode {
    if (this.state.error) {
      return <ErrorScreen error={this.state.error} />
    }
    return this.props.children
  }
}
