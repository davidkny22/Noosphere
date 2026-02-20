import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Noosphere crashed:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center z-[9999]">
        <div className="text-center max-w-md px-6">
          <h1 className="text-white text-2xl font-bold mb-3">Something went wrong</h1>
          <p className="text-gray-400 text-sm mb-1">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <p className="text-gray-500 text-xs mb-6">
            This is usually a WebGL or rendering error. Reloading should fix it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
