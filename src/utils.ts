// Utility functions for audio and MIDI (A4 reference configurable)

export const DEFAULT_A4_HZ = 440;

export function midiToFrequency(midi: number, a4Hz: number = DEFAULT_A4_HZ): number {
  return a4Hz * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(frequency: number, a4Hz: number = DEFAULT_A4_HZ): number {
  if (!Number.isFinite(frequency) || frequency <= 0 || !Number.isFinite(a4Hz) || a4Hz <= 0) {
    return NaN;
  }
  return Math.round(69 + 12 * Math.log2(frequency / a4Hz));
}

export function calculateCentsOff(detected: number, target: number): number {
  if (!Number.isFinite(detected) || !Number.isFinite(target) || detected <= 0 || target <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return 1200 * Math.log2(detected / target);
}

function pitchClassIndex(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function midiToNoteName(midi: number): string {
  if (!Number.isFinite(midi)) return '?';
  const noteNames = ['도', '도♯', '레', '레♯', '미', '파', '파♯', '솔', '솔♯', '라', '라♯', '시'];
  return noteNames[pitchClassIndex(midi)];
}

export function midiToNoteNameEng(midi: number): string {
  if (!Number.isFinite(midi)) return '?';
  const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${noteNames[pitchClassIndex(midi)]}${octave}`;
}

export function latchDetectedFrequency(
  previous: number | null,
  incoming: number | null
): number | null {
  if (incoming != null && Number.isFinite(incoming) && incoming > 0) {
    return incoming;
  }
  return previous;
}

export function isRest(note: { rest?: boolean }): boolean {
  return note.rest === true;
}

const DURATION_TO_VEX: Record<number, string> = {
  1: 'w',
  2: 'h',
  4: 'q',
  8: '8',
  16: '16'
};

export function vexDuration(note: {
  duration: number;
  dotted?: boolean;
  rest?: boolean;
  pitch?: number;
}): string {
  const base = DURATION_TO_VEX[note.duration] ?? 'q';
  const dots = note.dotted ? 'd' : '';
  const type = isRest(note) ? 'r' : '';
  return `${base}${dots}${type}`;
}

/**
 * Find the first playable note starting from fromIndex.
 * Skips rests and tied continuation notes.
 * A tied continuation is a note that follows a note with tie: true and has the same pitch.
 */
export function firstPlayableNoteIndex(
  notes: Array<{ rest?: boolean; tie?: boolean; pitch?: number }>,
  fromIndex: number
): number {
  for (let i = fromIndex; i < notes.length; i++) {
    // Skip rests
    if (isRest(notes[i])) continue;
    
    // Skip tied continuations: if previous note has tie: true and same pitch
    if (i > 0 && notes[i - 1].tie === true) {
      const prevPitch = notes[i - 1].pitch;
      const currPitch = notes[i].pitch;
      if (prevPitch != null && currPitch != null && prevPitch === currPitch) {
        continue; // This is a tied continuation, skip it
      }
    }
    
    // This is a playable note
    return i;
  }
  return -1;
}

/**
 * Reconcile octave differences between YIN and FFT pitch detection.
 * When one frequency is ~2× or ~3× the other (within ~70 cents), prefer the lower (fundamental).
 */
export function reconcileOctaves(
  yinFreq: number,
  fftFreq: number
): { frequency: number; source: string } {
  const OCTAVE_CENTS_TOLERANCE = 70;
  
  const checkMultiple = (f1: number, f2: number, multiple: number): boolean => {
    const expectedRatio = multiple;
    const actualRatio = f2 / f1;
    const cents = Math.abs(1200 * Math.log2(actualRatio / expectedRatio));
    return cents < OCTAVE_CENTS_TOLERANCE;
  };
  
  // Check if fftFreq is 2× or 3× yinFreq
  if (fftFreq > yinFreq * 1.8) {
    if (checkMultiple(yinFreq, fftFreq, 2)) {
      return { frequency: yinFreq, source: 'yin(2×fft)' };
    }
    if (checkMultiple(yinFreq, fftFreq, 3)) {
      return { frequency: yinFreq, source: 'yin(3×fft)' };
    }
  }
  
  // Check if yinFreq is 2× or 3× fftFreq
  if (yinFreq > fftFreq * 1.8) {
    if (checkMultiple(fftFreq, yinFreq, 2)) {
      return { frequency: fftFreq, source: 'fft(2×yin)' };
    }
    if (checkMultiple(fftFreq, yinFreq, 3)) {
      return { frequency: fftFreq, source: 'fft(3×yin)' };
    }
  }
  
  // No clear octave relationship - prefer YIN when it's in range
  return { frequency: yinFreq, source: 'yin' };
}
