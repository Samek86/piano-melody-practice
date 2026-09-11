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

  React.useEffect(() => {
    if (!currentSong || !scoreContainerRef.current) return;

    const container = scoreContainerRef.current;

    const initRenderer = () => {
      if (container.clientWidth === 0 || container.clientHeight === 0) {
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
      } catch (error) {
        console.error('Failed to initialize score renderer:', error);
        setRenderError('악보를 로드하는 중 오류가 발생했습니다.');
      }
    };

    initRenderer();

    return () => {
      scoreRendererRef.current?.destroy();
    };
  }, [currentSong, settings.showNoteNames, settings.showFingerNumbers]);

  React.useEffect(() => {
    if (!currentSong) return;

    // Initialize audio if not in test mode
    if (!settings.testMode) {
      audioCaptureRef.current = new AudioCapture();
      audioCaptureRef.current.initialize().catch(console.error);

      pitchDetectorRef.current = new PitchDetector({
        sampleRate: 44100,
        threshold: 0.9,
        analysisInterval: 50,
        noiseGate: -60
      });
    }

    noteMatcherRef.current = new NoteMatcher({
      toleranceCents: settings.toleranceCents,
      sustainWindowMs: settings.sustainWindowMs,
      debounceMs: 100
    });

    // Set target note
    noteMatcherRef.current.setTargetNote(currentSong.notes[0].pitch);

    // Start audio loop
    if (!settings.testMode) {
      startAudioLoop();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      audioCaptureRef.current?.cleanup();
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

      const buffer = audioCaptureRef.current.getAudioBuffer();
      const result = pitchDetectorRef.current.detect(buffer);

      if (result) {
        onPitchDetected(result.frequency, result.clarity);

        if (result.frequency) {
          const matchResult = noteMatcherRef.current.checkMatch(result.frequency);

          if (matchResult.matched) {
            scoreRendererRef.current?.highlightNote(currentNoteIndex, 'green');
            onNoteMatched();
          } else if (matchResult.centsOff && Math.abs(matchResult.centsOff) > settings.toleranceCents) {
            // Wrong note - briefly flash red
            scoreRendererRef.current?.highlightNote(currentNoteIndex, 'red');
            setTimeout(() => {
              scoreRendererRef.current?.highlightNote(currentNoteIndex, 'blue');
            }, 300);
          }
        }
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

  if (!currentSong) return null;

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

      <div className="score-container" ref={scoreContainerRef} />

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
