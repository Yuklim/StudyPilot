import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    if (import.meta.env.DEV) {
      console.error('StudyPilot page rendering failed.', error, errorInfo)
    }
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="error-page" role="alert">
          <section className="error-card">
            <span className="eyebrow">StudyPilot</span>
            <h1>页面暂时无法显示</h1>
            <p>请刷新页面重试。如果问题持续出现，请停止开发服务后重新启动。</p>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
