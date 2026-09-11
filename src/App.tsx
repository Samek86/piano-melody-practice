import { useAppStore } from './store/appStore';
import { SongSelection } from './components/SongSelection';
import { MicRequest } from './components/MicRequest';
import { PracticeScreen } from './components/PracticeScreen';
import { CompleteScreen } from './components/CompleteScreen';
import { ErrorScreen } from './components/ErrorScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/app.css';

function App() {
  const { appState, startPractice, exitPractice } = useAppStore();

  return (
    <div className="app">
      {appState === 'idle' && <SongSelection />}
      {appState === 'song-selection' && <SongSelection />}
      {appState === 'requesting-mic' && <MicRequest onGranted={startPractice} />}
      {(appState === 'practice' || appState === 'paused') && (
        <ErrorBoundary fallback={(error, resetError) => (
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
              <h2 style={{ color: '#e53e3e', marginBottom: '16px' }}>연습 화면 오류</h2>
              <p style={{ color: '#718096', marginBottom: '24px', maxWidth: '500px' }}>
                {error.message || '알 수 없는 오류가 발생했습니다'}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button className="btn btn-primary" onClick={resetError}>
                  다시 시도
                </button>
                <button className="btn btn-secondary" onClick={exitPractice}>
                  곡 선택으로 돌아가기
                </button>
              </div>
            </div>
          </div>
        )}>
          <PracticeScreen />
        </ErrorBoundary>
      )}
      {appState === 'complete' && <CompleteScreen />}
      {appState === 'error' && <ErrorScreen />}
    </div>
  );
}

export default App;
