// Song data types with user deltas

export type Difficulty = 'beginner' | 'easy' | 'medium';
export type Origin = 'korean' | 'japanese';

export interface Note {
  pitch: number;        // MIDI note number (60 = C4)
  duration: number;     // 4 = quarter note, 2 = half note, 8 = eighth note
  finger?: number;      // Finger number 1-5 (NEW: user requirement)
  dotted?: boolean;
  tie?: boolean;
  lyric?: string;
}

export interface Song {
  id: string;
  title: string;
  titleKo: string;
  titleJa?: string;           // Japanese title if applicable
  origin: Origin;             // NEW: korean or japanese
  composer?: string;
  difficulty: Difficulty;
  tempo: number;              // BPM
  timeSignature: [number, number];
  key: string;
  notes: Note[];
  tags: string[];
  description?: string;
  duration?: number;
  ageRecommendation?: string;
  pickupBeats?: number;       // Anacrusis/incomplete first measure in beats (e.g., 1 for one quarter-note pickup in 3/4 time)
}

export interface PitchDetectionResult {
  frequency: number | null;
  clarity: number;
  timestamp: number;
}

export interface MatchResult {
  matched: boolean;
  targetNote: number;
  detectedNote: number | null;
  centsOff: number | null;
  sustainedMs: number;
}
