import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: (error: Error, resetError: () => void) => React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError);
      }

      return (
        <div className="practice-container">
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            padding: '40px',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>⚠️</div>
            <h2 style={{ color: '#e53e3e', marginBottom: '16px' }}>
              오류가 발생했습니다
            </h2>
            <p style={{ color: '#718096', marginBottom: '16px', maxWidth: '500px' }}>
              연습 화면을 로드하는 중 문제가 발생했습니다.
            </p>
            <details style={{ 
              marginBottom: '24px', 
              padding: '12px', 
              background: '#f7fafc',
              borderRadius: '8px',
              maxWidth: '500px',
              textAlign: 'left'
            }}>
              <summary style={{ cursor: 'pointer', color: '#4299e1', marginBottom: '8px' }}>
                기술 정보 보기
              </summary>
              <pre style={{ 
                fontSize: '0.8rem', 
                color: '#2d3748',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word'
              }}>
                {this.state.error.message}
                {'\n\n'}
                {this.state.error.stack}
              </pre>
            </details>
            <button 
              className="btn btn-primary" 
              onClick={this.resetError}
            >
              다시 시도
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
