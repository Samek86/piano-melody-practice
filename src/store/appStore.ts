import { create } from 'zustand';
import { Song } from '../types';
import { DEFAULT_A4_HZ, firstPlayableNoteIndex, latchDetectedFrequency } from '../utils';

const SETTINGS_KEY = 'piano-practice-settings';

function loadSettings() {
  const defaults = {
    toleranceCents: 50,
    sustainWindowMs: 200,
    showNoteNames: true,
    showFingerNumbers: false,
    testMode: false,
    a4Hz: DEFAULT_A4_HZ
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<typeof defaults>;
    return {
      ...defaults,
      ...parsed,
      testMode: false,
      a4Hz: DEFAULT_A4_HZ
    };
  } catch {
    return defaults;
  }
}

function saveSettings(settings: ReturnType<typeof loadSettings>) {
  try {
    const { testMode: _t, ...rest } = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
  } catch {
    /* ignore */
  }
}

export type AppState = 'idle' | 'song-selection' | 'requesting-mic' | 'practice' | 'paused' | 'complete' | 'error';
export type PracticeState = 'waiting' | 'detecting' | 'matching' | 'sustaining' | 'success' | 'wrong-note';

interface AppStore {
  // Global state
  appState: AppState;
  
  // Song related
  currentSong: Song | null;
  currentNoteIndex: number;
  
  // Audio related
  isListening: boolean;
  detectedPitch: number | null;
  detectedClarity: number;
  
  // Practice session
  practiceState: PracticeState;
  sessionStartTime: number | null;
  correctNotes: number;
  incorrectAttempts: number;
  sustainProgress: number; // 0-1
  
  // Error
  error: string | null;
  
  // Settings
  settings: {
    toleranceCents: number;
    sustainWindowMs: number;
    showNoteNames: boolean;
    showFingerNumbers: boolean;
    testMode: boolean;
    /** Internal reference pitch for A4 in Hz (fixed at 440). ±50 cent tolerance covers 438-445 Hz pianos. */
    a4Hz: number;
  };
  
  // Actions
  setAppState: (state: AppState) => void;
  selectSong: (song: Song) => void;
  startPractice: () => void;
  pausePractice: () => void;
  resumePractice: () => void;
  exitPractice: () => void;
  
  onPitchDetected: (frequency: number | null, clarity: number) => void;
  onNoteMatched: () => void;
  onWrongNote: () => void;
  advanceToNextNote: () => void;
  skipRests: () => void;
  
  resetSession: () => void;
  setError: (error: string | null) => void;
  updateSettings: (settings: Partial<AppStore['settings']>) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  appState: 'idle',
  currentSong: null,
  currentNoteIndex: 0,
  isListening: false,
  detectedPitch: null,
  detectedClarity: 0,
  practiceState: 'waiting',
  sessionStartTime: null,
  correctNotes: 0,
  incorrectAttempts: 0,
  sustainProgress: 0,
  error: null,
  settings: loadSettings(),
  
  // Actions
  setAppState: (appState) => set({ appState }),
  
  selectSong: (song) => set({
    currentSong: song,
    currentNoteIndex: 0,
    appState: 'requesting-mic',
    settings: { ...get().settings, testMode: false }
  }),
  
  startPractice: () => set({
    appState: 'practice',
    practiceState: 'waiting',
    sessionStartTime: Date.now(),
    correctNotes: 0,
    incorrectAttempts: 0,
    isListening: true,
    sustainProgress: 0,
    detectedPitch: null,
    detectedClarity: 0
  }),
  
  pausePractice: () => set({
    appState: 'paused',
    isListening: false
  }),
  
  resumePractice: () => set({
    appState: 'practice',
    isListening: true
  }),
  
  exitPractice: () => set({
    appState: 'song-selection',
    isListening: false,
    currentSong: null,
    currentNoteIndex: 0,
    sustainProgress: 0,
    detectedPitch: null,
    settings: { ...get().settings, testMode: false }
  }),
  
  onPitchDetected: (frequency, clarity) => {
    const prev = get();
    const valid = frequency != null && Number.isFinite(frequency) && frequency > 0;
    set({
      detectedPitch: latchDetectedFrequency(prev.detectedPitch, frequency),
      detectedClarity: valid ? clarity : prev.detectedClarity,
      practiceState: valid ? 'detecting' : 'waiting'
    });
  },
  
  onNoteMatched: () => {
    const { correctNotes, currentNoteIndex, currentSong } = get();
    const isLastNote = currentSong && currentNoteIndex === currentSong.notes.length - 1;
    
    set({
      practiceState: 'success',
      correctNotes: correctNotes + 1,
      sustainProgress: 1
    });
    
    if (isLastNote) {
      setTimeout(() => set({ appState: 'complete', isListening: false }), 500);
    } else {
      setTimeout(() => {
        set({
          currentNoteIndex: get().currentNoteIndex + 1,
          practiceState: 'waiting',
          sustainProgress: 0
        });
      }, 50);
    }
  },
  
  onWrongNote: () => {
    const { incorrectAttempts } = get();
    set({
      practiceState: 'wrong-note',
      incorrectAttempts: incorrectAttempts + 1
    });
    
    setTimeout(() => set({ practiceState: 'waiting' }), 300);
  },
  
  advanceToNextNote: () => {
    set({
      currentNoteIndex: get().currentNoteIndex + 1,
      practiceState: 'waiting',
      sustainProgress: 0
    });
  },

  skipRests: () => {
    const { currentSong, currentNoteIndex } = get();
    if (!currentSong) return;
    const next = firstPlayableNoteIndex(currentSong.notes, currentNoteIndex);
    if (next === currentNoteIndex) return;
    if (next < 0) {
      set({ appState: 'complete', isListening: false });
      return;
    }
    set({
      currentNoteIndex: next,
      practiceState: 'waiting',
      sustainProgress: 0
    });
  },
  
  resetSession: () => set({
    currentNoteIndex: 0,
    correctNotes: 0,
    incorrectAttempts: 0,
    sessionStartTime: null,
    sustainProgress: 0
  }),
  
  setError: (error) => set({
    error,
    appState: error ? 'error' : 'idle'
  }),
  
  updateSettings: (newSettings) => set((state) => {
    const settings = { ...state.settings, ...newSettings };
    saveSettings(settings);
    return { settings };
  })
}));
