import { create } from 'zustand';
import { Song } from '../types';

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
  settings: {
    toleranceCents: 50,
    sustainWindowMs: 200,
    showNoteNames: true,
    showFingerNumbers: true,
    testMode: false
  },
  
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
    sustainProgress: 0
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
  
  onPitchDetected: (frequency, clarity) => set({
    detectedPitch: frequency,
    detectedClarity: clarity,
    practiceState: frequency ? 'detecting' : 'waiting'
  }),
  
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
      }, 300);
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
  
  updateSettings: (newSettings) => set((state) => ({
    settings: { ...state.settings, ...newSettings }
  }))
}));
