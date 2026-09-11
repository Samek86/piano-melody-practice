import React from 'react';
import { useAppStore } from '../store/appStore';

export const MicRequest: React.FC<{ onGranted: () => void }> = ({ onGranted }) => {
  const { currentSong, setError, setAppState } = useAppStore();
  const [requesting, setRequesting] = React.useState(false);

  const requestMic = async () => {
    setRequesting(true);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      onGranted();
    } catch (error) {
      setError(`마이크 접근 실패: ${(error as Error).message}`);
    }
    setRequesting(false);
  };

  const useTestMode = () => {
    useAppStore.getState().updateSettings({ testMode: true });
    onGranted();
  };

  if (!currentSong) return null;

  return (
    <div className="container">
      <div className="card">
        <h2>🎤 마이크 권한 필요</h2>
        <p style={{ color: '#718096', marginBottom: '20px' }}>
          <strong>{currentSong.titleKo}</strong>를 연습하려면 마이크 접근 권한이 필요합니다.
        </p>
        <p style={{ color: '#718096', marginBottom: '20px', fontSize: '0.9rem' }}>
          ⚠️ iOS/Safari: HTTPS 필요, 사용자 클릭 후 마이크 활성화<br />
          ⚠️ 브라우저에서 권한 요청이 표시되면 허용을 눌러주세요
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button
            className="btn btn-primary"
            onClick={requestMic}
            disabled={requesting}
          >
            {requesting ? '요청 중...' : '🎤 마이크 사용하기'}
          </button>
          <button
            className="btn btn-secondary"
            onClick={useTestMode}
          >
            ⌨️ 테스트 모드 (키보드)
          </button>
        </div>
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <button
            className="btn"
            onClick={() => setAppState('song-selection')}
            style={{ background: '#e2e8f0', color: '#2d3748' }}
          >
            ← 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
};
