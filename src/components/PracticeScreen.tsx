import React, { useLayoutEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { ScoreRenderer } from '../modules/ui/ScoreRenderer';
import { AudioCapture } from '../modules/audio/AudioCapture';
import { takeBootstrappedAudioCapture } from '../modules/audio/audioSession';
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
  const appStateRef = React.useRef(appState);
  React.useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);
  const [renderError, setRenderError] = React.useState<string | null>(null);
  const [needsMicUnlock, setNeedsMicUnlock] = React.useState(false);
  const [isScoreReady, setIsScoreReady] = React.useState(false);
  const lastPitchPublishRef = React.useRef(0);
  const lastPublishedFreqRef = React.useRef<number | null>(null);
  const currentNoteIndexRef = React.useRef(currentNoteIndex);
  React.useEffect(() => {
    currentNoteIndexRef.current = currentNoteIndex;
  }, [currentNoteIndex]);

  useLayoutEffect(() => {
    if (!currentSong || !scoreContainerRef.current) return;

    setIsScoreReady(false);
    const container = scoreContainerRef.current;
    let tries = 0;

    const initRenderer = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) {
        tries += 1;
        if (tries > 60) {
          setRenderError('악보 영역 크기를 잡지 못했습니다. 화면을 한번 탭하거나 회전해 보세요.');
          return;
        }
        requestAnimationFrame(initRenderer);
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
        setIsScoreReady(true);
      } catch (error) {
        console.error('Failed to initialize score renderer:', error);
        setRenderError('악보를 로드하는 중 오류가 발생했습니다.');
        setIsScoreReady(false);
      }
    };

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

    let cancelled = false;

    const initializeAudio = async () => {
      if (settings.testMode) return;
      try {
        // Prefer capture started in the mic-button tap (iOS AudioContext)
        const bootstrapped = takeBootstrappedAudioCapture();
        if (cancelled) {
          bootstrapped?.cleanup();
          return;
        }
        if (bootstrapped) {
          audioCaptureRef.current = bootstrapped;
        } else {
          audioCaptureRef.current = new AudioCapture();
          await audioCaptureRef.current.initialize();
          if (cancelled) {
            audioCaptureRef.current.cleanup();
            audioCaptureRef.current = null;
            return;
          }
          await audioCaptureRef.current.resume();
        }
        if (!audioCaptureRef.current?.isReady) {
          throw new Error('마이크 초기화가 완료되지 않았습니다');
        }
        if (audioCaptureRef.current.state === 'suspended') {
          setNeedsMicUnlock(true);
        }

        const actualSampleRate = audioCaptureRef.current.getSampleRate();
        console.log(`[PracticeScreen] Using sample rate: ${actualSampleRate} Hz`);

        pitchDetectorRef.current = new PitchDetector({
          sampleRate: actualSampleRate,
          threshold: 0.5,
          analysisInterval: 50,
          noiseGate: -55
        });

        if (!cancelled) startAudioLoop();
      } catch (error) {
        console.error('[PracticeScreen] Audio initialization failed:', error);
        if (!cancelled) {
          setRenderError(`마이크 시작 실패: ${(error as Error).message}`);
        }
      }
    };

    noteMatcherRef.current = new NoteMatcher({
      toleranceCents: settings.toleranceCents,
      sustainWindowMs: settings.sustainWindowMs,
      debounceMs: 100
    });
    noteMatcherRef.current.setTargetNote(currentSong.notes[0].pitch);

    // Paint score first, then start mic
    const deferAudio = window.setTimeout(() => { void initializeAudio(); }, 100);

    return () => {
      cancelled = true;
      window.clearTimeout(deferAudio);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      audioCaptureRef.current?.cleanup();
      audioCaptureRef.current = null;
      pitchDetectorRef.current = null;
    };
  }, [currentSong, settings.testMode]);

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
      if (!audioCaptureRef.current || !pitchDetectorRef.current || !noteMatcherRef.current) {
        return;
      }

      if (audioCaptureRef.current.state === 'suspended') {
        void audioCaptureRef.current.resume();
        animationFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      try {
        if (!audioCaptureRef.current.isReady) {
          if (appStateRef.current === 'practice') {
            animationFrameRef.current = requestAnimationFrame(loop);
          }
          return;
        }
        const buffer = audioCaptureRef.current.getAudioBuffer();
        if (!buffer) {
          if (appStateRef.current === 'practice') {
            animationFrameRef.current = requestAnimationFrame(loop);
          }
          return;
        }
        const result = pitchDetectorRef.current.detect(buffer);

        if (result) {
          const now = Date.now();
          const freqChanged =
            (result.frequency == null && lastPublishedFreqRef.current != null) ||
            (result.frequency != null &&
              (lastPublishedFreqRef.current == null ||
                Math.abs(result.frequency - lastPublishedFreqRef.current) > 1));
          if (freqChanged || now - lastPitchPublishRef.current > 120) {
            lastPitchPublishRef.current = now;
            lastPublishedFreqRef.current = result.frequency;
            onPitchDetected(result.frequency, result.clarity);
          }

          if (result.frequency) {
            const matchResult = noteMatcherRef.current.checkMatch(result.frequency);
            const noteIdx = currentNoteIndexRef.current;

            if (matchResult.matched) {
              scoreRendererRef.current?.highlightNote(noteIdx, 'green');
              onNoteMatched();
            } else if (
              matchResult.centsOff != null &&
              Math.abs(matchResult.centsOff) > settings.toleranceCents
            ) {
              scoreRendererRef.current?.highlightNote(noteIdx, 'red');
              setTimeout(() => {
                scoreRendererRef.current?.highlightNote(noteIdx, 'blue');
              }, 300);
            }
          }
        }
      } catch (err) {
        console.error('[PracticeScreen] audio loop error:', err);
      }

      if (appStateRef.current === 'practice') {
        animationFrameRef.current = requestAnimationFrame(loop);
      }
    };

    loop();
  };

  const unlockMic = async () => {
    if (!audioCaptureRef.current) return;
    await audioCaptureRef.current.resume();
    if (audioCaptureRef.current.state !== 'suspended') {
      setNeedsMicUnlock(false);
      if (!animationFrameRef.current && appStateRef.current === 'practice') {
        startAudioLoop();
      }
    }
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
        <div className="practice-header">
          <h2 style={{ margin: 0 }}>연습</h2>
          <button className="btn btn-danger" onClick={exitPractice}>✕ 나가기</button>
        </div>
        <div style={{ padding: 24, textAlign: 'center' }}>곡 정보가 없습니다. 다시 선택해 주세요.</div>
      </div>
    );
  }

  const progress = ((currentNoteIndex / currentSong.notes.length) * 100);
  const currentNote = currentSong.notes[currentNoteIndex];

  if (renderError) {
    return (
      <div className="practice-container" onPointerDown={needsMicUnlock ? () => { void unlockMic(); } : undefined}>
      {needsMicUnlock && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            background: 'rgba(26,32,44,0.72)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 24,
            fontSize: '1.1rem',
            fontWeight: 600
          }}
        >
          마이크를 켜려면 화면을 탭하세요
        </div>
      )}
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
    <div className="practice-container" onPointerDown={needsMicUnlock ? () => { void unlockMic(); } : undefined}>
      {needsMicUnlock && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 20,
            background: 'rgba(26,32,44,0.72)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: 24,
            fontSize: '1.1rem',
            fontWeight: 600
          }}
        >
          마이크를 켜려면 화면을 탭하세요
        </div>
      )}
      <div className="practice-header">
        <div>
          <h2 style={{ margin: 0 }}>{currentSong.titleKo}</h2>
          <div style={{ color: '#718096', fontSize: '0.9rem' }}>
            음표 {currentNoteIndex + 1} / {currentSong.notes.length} · pitchfix1
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

      <div className="score-container">
        {!isScoreReady && !renderError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#4a5568',
              zIndex: 1,
              pointerEvents: 'none'
            }}
          >
            악보 준비 중…
          </div>
        )}
        {/* VexFlow owns this node exclusively — never put React children inside */}
        <div ref={scoreContainerRef} className="score-host" />
      </div>

      <div className="practice-footer">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="pitch-indicator">
          {detectedPitch && Number.isFinite(detectedPitch) && detectedPitch > 0 && Number.isFinite(frequencyToMidi(detectedPitch)) ? (
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
