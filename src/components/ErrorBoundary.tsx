import React from 'react';

type Props = { children: React.ReactNode; onReset?: () => void };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="container">
          <div className="card">
            <h2>화면 오류</h2>
            <p style={{ color: '#718096', marginBottom: 16 }}>
              연습 화면을 그리다가 문제가 생겼어요. 다시 시도해 주세요.
            </p>
            <pre style={{ fontSize: 12, overflow: 'auto', background: '#f7fafc', padding: 12 }}>
              {this.state.error.message}
            </pre>
            <button
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              onClick={() => {
                this.setState({ error: null });
                this.props.onReset?.();
              }}
            >
              곡 선택으로 돌아가기
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
