import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('SniffOutPro UI error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error !== null) {
      return (
        <main style={{ padding: '2rem', fontFamily: 'Segoe UI, system-ui, sans-serif' }}>
          <h1>SniffOutPro failed to load</h1>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b91c1c' }}>{this.state.error.message}</pre>
          <p>Check the terminal running <code>pnpm tauri dev</code> for details.</p>
        </main>
      );
    }
    return this.props.children;
  }
}
