import React from 'react';
import { useAppStore } from '../store/appStore';

export const CompleteScreen: React.FC = () => {
  const { currentSong, sessionStartTime, correctNotes, incorrectAttempts, setAppState, resetSession } = useAppStore();

  if (!currentSong || !sessionStartTime) return null;

  const elapsedSeconds = Math.floor((Date.now() - sessionStartTime) / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const accuracy = Math.round((correctNotes / (correctNotes + incorrectAttempts)) * 100);

  const handleRetry = () => {
    resetSession();
    useAppStore.getState().startPractice();
  };

  const handleNextSong = () => {
    resetSession();
    setAppState('song-selection');
  };

  return (
    <div className="container">
      <div className="card complete-screen">
        <div className="celebration">🎉</div>
        <h1>완주했습니다!</h1>
        <p className="complete-subtitle">
          <strong>{currentSong.titleKo}</strong>를 성공적으로 연주하셨습니다!
        </p>

        <div className="stats">
          <div className="stat-row">
            <span className="stat-label">소요 시간</span>
            <span className="stat-value">{minutes}분 {seconds}초</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">음표 수</span>
            <span className="stat-value">{currentSong.notes.length}개</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">정확도</span>
            <span className="stat-value">{accuracy}%</span>
          </div>
          <div className="stat-row">
            <span className="stat-label">시도 횟수</span>
            <span className="stat-value">{correctNotes + incorrectAttempts}번</span>
          </div>
        </div>

        <div className="complete-actions">
          <button className="btn btn-secondary" onClick={handleRetry}>
            🔄 다시 연습
          </button>
          <button className="btn btn-primary" onClick={handleNextSong}>
            📋 다른 곡 선택
          </button>
        </div>
      </div>
    </div>
  );
};
