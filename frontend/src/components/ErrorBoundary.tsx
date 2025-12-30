import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

interface FrontendErrorReport {
  error_type: string
  message: string
  stack_trace?: string
  component?: string
  url?: string
  user_action?: string
  is_react_crash: boolean
  breadcrumbs: string[]
}

// Detect if running in a desktop app
const isDesktopApp = (): boolean => {
  if ((window as any).electron) return true
  if ((window as any).__TAURI__) return true
  if (window.location.protocol === 'tauri:' || window.location.protocol === 'file:')
    return true
  return false
}

const getBaseURL = (): string => {
  return isDesktopApp() ? 'http://127.0.0.1:8000/api/v1' : '/api/v1'
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo })
    this.reportError(error, errorInfo)
  }

  private async reportError(error: Error, errorInfo: ErrorInfo): Promise<void> {
    const report: FrontendErrorReport = {
      error_type: error.name || 'Error',
      message: error.message,
      stack_trace: error.stack,
      component: errorInfo.componentStack || undefined,
      url: window.location.href,
      user_action: 'React component crash',
      is_react_crash: true,
      breadcrumbs: [],
    }

    try {
      const baseURL = getBaseURL()
      await fetch(`${baseURL}/bugs/frontend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      })
      console.log('Error reported to bug tracking system')
    } catch (e) {
      console.error('Failed to report error:', e)
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-boundary-fallback" style={styles.container}>
          <div style={styles.content}>
            <h2 style={styles.title}>Something went wrong</h2>
            <p style={styles.message}>
              The application encountered an unexpected error. This has been
              automatically reported.
            </p>
            <details style={styles.details}>
              <summary style={styles.summary}>Error Details</summary>
              <pre style={styles.pre}>
                {this.state.error?.toString()}
                {'\n\n'}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
            <button onClick={this.handleRetry} style={styles.button}>
              Try Again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '20px',
    backgroundColor: '#f5f5f5',
  },
  content: {
    maxWidth: '600px',
    padding: '40px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
    textAlign: 'center' as const,
  },
  title: {
    color: '#dc3545',
    marginBottom: '16px',
  },
  message: {
    color: '#666',
    marginBottom: '24px',
  },
  details: {
    textAlign: 'left' as const,
    marginBottom: '24px',
    backgroundColor: '#f8f9fa',
    padding: '16px',
    borderRadius: '4px',
  },
  summary: {
    cursor: 'pointer',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  pre: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontSize: '12px',
    maxHeight: '200px',
    overflow: 'auto',
    margin: '8px 0 0 0',
  },
  button: {
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '4px',
    fontSize: '16px',
    cursor: 'pointer',
  },
}

export default ErrorBoundary
