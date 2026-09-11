import React from 'react';
import { useAppStore } from '../store/appStore';
import { ScoreRenderer } from '../modules/ui/ScoreRenderer';
import { AudioCapture } from '../modules/audio/AudioCapture';
import { PitchDetector } from '../modules/audio/PitchDetector';
import { NoteMatcher } from '../modules/game/NoteMatcher';
import { SoftKeyboard } from './SoftKeyboard';
import { midiToNoteName, frequencyToMidi } from '../utils';

export const PracticeScreen: React.FC = () => {
  const {
    currentSong,
    currentNoteIndex,
    detectedPitch,
    settings,
    audioCapture: storeAudioCapture,
    pausePractice,
    resumePractice,
    exitPractice,
    onPitchDetected,
    onNoteMatched,
    onWrongNote,
    appState
  } = useAppStore();

  const scoreContainerRef = React.useRef<HTMLDivElement>(null);
  const scoreRendererRef = React.useRef<ScoreRenderer | null>(null);
  const audioCaptureRef = React.useRef<AudioCapture | null>(null);
  const pitchDetectorRef = React.useRef<PitchDetector | null>(null);
  const noteMatcherRef = React.useRef<NoteMatcher | null>(null);
  const animationFrameRef = React.useRef<number | null>(null);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [isScoreLoading, setIsScoreLoading] = React.useState<boolean>(true);
  const lastPitchUpdateRef = React.useRef<{ frequency: number | null; time: number }>({ 
    frequency: null, 
    time: 0 
  });

  React.useEffect(() => {
    if (!currentSong || !scoreContainerRef.current) return;

    const container = scoreContainerRef.current;
    let retryCount = 0;
    const maxRetries = 20;

    const initRenderer = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        retryCount++;
        if (retryCount < maxRetries) {
          requestAnimationFrame(initRenderer);
        } else {
          console.error('[PracticeScreen] Score container size still 0 after retries');
          setRenderError('악보 영역을 초기화할 수 없습니다. 화면을 회전하거나 페이지를 새로고침하세요.');
          setIsScoreLoading(false);
        }
        return;
      }

      try {
        scoreRendererRef.current = new ScoreRenderer(
          container,
          currentSong.notes,
          {
            width: container.clientWidth,
            height: container.clientHeight,
            showNoteNames: settings.showNoteNames,
            showFingerNumbers: settings.showFingerNumbers
          },
          currentSong.timeSignature
        );

        scoreRendererRef.current.highlightNote(0, 'blue');
        setRenderError(null);
        setIsScoreLoading(false);
        console.log('[PracticeScreen] Score renderer initialized successfully');
      } catch (error) {
        console.error('[PracticeScreen] Failed to initialize score renderer:', error);
        setRenderError('악보를 로드하는 중 오류가 발생했습니다.');
        setIsScoreLoading(false);
      }
    };

    setIsScoreLoading(true);
    initRenderer();

    // ResizeObserver to handle orientation changes and container resizing
    const resizeObserver = new ResizeObserver(() => {
      if (container.clientWidth > 0 && container.clientHeight > 0 && scoreRendererRef.current) {
        scoreRendererRef.current.updateConfig({
          width: container.clientWidth,
          height: container.clientHeight
        });
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      scoreRendererRef.current?.destroy();
    };
  }, [currentSong, settings.showNoteNames, settings.showFingerNumbers]);

  React.useEffect(() => {
    if (!currentSong) return;

    const initializeAudio = async () => {
      if (!settings.testMode) {
        try {
          // Use pre-initialized AudioCapture from MicRequest (iOS user gesture)
          if (storeAudioCapture) {
            console.log('[PracticeScreen] Using pre-initialized AudioCapture from store');
            audioCaptureRef.current = storeAudioCapture;
          } else {
            // Fallback: initialize here (for desktop browsers)
            console.log('[PracticeScreen] No pre-initialized AudioCapture, creating new one');
            audioCaptureRef.current = new AudioCapture();
            await audioCaptureRef.current.initialize();
          }

          // Get the actual device sample rate (iOS often 48000, desktop often 44100)
          const actualSampleRate = audioCaptureRef.current.getSampleRate();
          console.log(`[PracticeScreen] Using sample rate: ${actualSampleRate} Hz`);

          // Create PitchDetector with actual sample rate and relaxed threshold
          pitchDetectorRef.current = new PitchDetector({
            sampleRate: actualSampleRate,
            threshold: 0.5,
            analysisInterval: 50,
            noiseGate: -50
          });

          // Start audio loop after initialization is complete
          startAudioLoop();
        } catch (error) {
          console.error('[PracticeScreen] Audio initialization failed:', error);
          setRenderError('오디오 초기화 실패. 마이크 권한을 확인하세요.');
        }
      }
    };

    noteMatcherRef.current = new NoteMatcher({
      toleranceCents: settings.toleranceCents,
      sustainWindowMs: settings.sustainWindowMs,
      debounceMs: 100
    });

    // Set target note
    noteMatcherRef.current.setTargetNote(currentSong.notes[0].pitch);

    // Initialize audio asynchronously
    initializeAudio();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // Don't cleanup here - it's managed by exitPractice in the store
    };
  }, [currentSong, settings.testMode, storeAudioCapture]);

  React.useEffect(() => {
    if (!currentSong || !noteMatcherRef.current) return;

    // Update target note when index changes
    if (currentNoteIndex < currentSong.notes.length) {
      noteMatcherRef.current.setTargetNote(currentSong.notes[currentNoteIndex].pitch);
      scoreRendererRef.current?.clearHighlight(currentNoteIndex - 1);
      scoreRendererRef.current?.highlightNote(currentNoteIndex, 'blue');
    }
  }, [currentNoteIndex, currentSong]);

  const startAudioLoop = () => {
    const loop = () => {
      try {
        if (!audioCaptureRef.current || !pitchDetectorRef.current || !noteMatcherRef.current) {
          return;
        }

        const buffer = audioCaptureRef.current.getAudioBuffer();
        const result = pitchDetectorRef.current.detect(buffer);

        if (result) {
          const now = Date.now();
          const lastUpdate = lastPitchUpdateRef.current;
          const frequencyChanged = result.frequency !== lastUpdate.frequency;
          const throttleElapsed = now - lastUpdate.time >= 100;

          // Only update state if frequency changed or 100ms elapsed (throttle)
          if (frequencyChanged || throttleElapsed) {
            onPitchDetected(result.frequency, result.clarity);
            lastPitchUpdateRef.current = { frequency: result.frequency, time: now };
          }

          if (result.frequency) {
            const matchResult = noteMatcherRef.current.checkMatch(result.frequency);

            if (matchResult.matched) {
              scoreRendererRef.current?.highlightNote(currentNoteIndex, 'green');
              onNoteMatched();
            } else if (matchResult.centsOff && Math.abs(matchResult.centsOff) > settings.toleranceCents) {
              scoreRendererRef.current?.highlightNote(currentNoteIndex, 'red');
              setTimeout(() => {
                scoreRendererRef.current?.highlightNote(currentNoteIndex, 'blue');
              }, 300);
            }
          }
        }
      } catch (error) {
        console.error('[PracticeScreen] Audio loop error:', error);
      }

      if (appState === 'practice') {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    loop();
  };

  const handleKeyboardNote = (midiNote: number) => {
    if (!noteMatcherRef.current || !currentSong) return;

    const frequency = 440 * Math.pow(2, (midiNote - 69) / 12);
    onPitchDetected(frequency, 1.0);

    const matchResult = noteMatcherRef.current.matchInstant(midiNote);

    if (matchResult.matched) {
      scoreRendererRef.current?.highlightNote(currentNoteIndex, 'green');
      onNoteMatched();
    } else {
      scoreRendererRef.current?.highlightNote(currentNoteIndex, 'red');
      onWrongNote();
      setTimeout(() => {
        scoreRendererRef.current?.highlightNote(currentNoteIndex, 'blue');
      }, 300);
    }
  };

  if (!currentSong) {
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
          <div style={{ fontSize: '3rem', marginBottom: '20px' }}>🎵</div>
          <h2 style={{ color: '#2d3748', marginBottom: '16px' }}>곡이 선택되지 않았습니다</h2>
          <p style={{ color: '#718096', marginBottom: '24px' }}>
            연습할 곡을 선택해주세요.
          </p>
          <button className="btn btn-primary" onClick={exitPractice}>
            곡 선택으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const progress = ((currentNoteIndex / currentSong.notes.length) * 100);
  const currentNote = currentSong.notes[currentNoteIndex];

  if (renderError) {
    return (
      <div className="practice-container">
        <div className="practice-header">
          <div>
            <h2 style={{ margin: 0 }}>{currentSong.titleKo}</h2>
          </div>
          <div className="controls">
            <button className="btn btn-danger" onClick={exitPractice}>
              ✕ 나가기
            </button>
          </div>
        </div>
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
          <h2 style={{ color: '#e53e3e', marginBottom: '16px' }}>{renderError}</h2>
          <p style={{ color: '#718096', marginBottom: '24px' }}>
            다시 시도하려면 다른 곡을 선택하거나 페이지를 새로고침하세요.
          </p>
          <button className="btn btn-primary" onClick={exitPractice}>
            곡 선택으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="practice-container">
      <div className="practice-header">
        <div>
          <h2 style={{ margin: 0 }}>{currentSong.titleKo}</h2>
          <div style={{ color: '#718096', fontSize: '0.9rem' }}>
            음표 {currentNoteIndex + 1} / {currentSong.notes.length}
          </div>
        </div>
        <div className="controls">
          {appState === 'practice' && (
            <button className="btn btn-secondary" onClick={pausePractice}>
              ⏸ 일시정지
            </button>
          )}
          {appState === 'paused' && (
            <button className="btn btn-primary" onClick={resumePractice}>
              ▶ 재개
            </button>
          )}
          <button className="btn btn-danger" onClick={exitPractice}>
            ✕ 나가기
            </button>
        </div>
      </div>

      <div className="score-container" ref={scoreContainerRef}>
        {isScoreLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#4299e1',
            fontSize: '1.2rem',
            textAlign: 'center'
          }}>
            <div style={{ marginBottom: '12px' }}>🎼</div>
            <div>악보 로딩 중...</div>
          </div>
        )}
      </div>

      <div className="practice-footer">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="pitch-indicator">
          {detectedPitch ? (
            <>
              🎵 감지: {midiToNoteName(frequencyToMidi(detectedPitch))} 
              {currentNote && ` (목표: ${midiToNoteName(currentNote.pitch)})`}
            </>
          ) : (
            <>
              {currentNote && `목표: ${midiToNoteName(currentNote.pitch)}`}
              {currentNote?.finger && ` | 손가락: ${currentNote.finger}번`}
            </>
          )}
        </div>

        {settings.testMode && (
          <SoftKeyboard onNotePlay={handleKeyboardNote} />
        )}
      </div>
    </div>
  );
};
