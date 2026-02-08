import { Component, type ReactNode } from 'react';
import { logError } from '../utils/errorReporter';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('MolViewer Error:', error, errorInfo);
    logError(error, {
      componentStack: errorInfo.componentStack ?? 'unknown',
      source: 'ErrorBoundary',
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="error-boundary-fallback">
            <h2>Something went wrong</h2>
            <p>An unexpected error occurred. Please try refreshing the page.</p>
            <button onClick={() => this.setState({ hasError: false, error: null })}>
              Try again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
