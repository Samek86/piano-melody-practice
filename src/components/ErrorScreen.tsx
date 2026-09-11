import React from 'react';
import { useAppStore } from '../store/appStore';

export const ErrorScreen: React.FC = () => {
  const { error, setError, setAppState } = useAppStore();

  const handleRetry = () => {
    setError(null);
    setAppState('song-selection');
  };

  return (
    <div className="container">
      <div className="card">
        <h2>⚠️ 오류 발생</h2>
        <p style={{ color: '#e53e3e', marginBottom: '20px' }}>
          {error}
        </p>
        <button className="btn btn-primary" onClick={handleRetry}>
          다시 시도
        </button>
      </div>
    </div>
  );
};
