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

export function firstPlayableNoteIndex(
  notes: Array<{ rest?: boolean; tie?: boolean; pitch?: number }>,
  fromIndex: number
): number {
  for (let i = fromIndex; i < notes.length; i++) {
    if (isRest(notes[i])) continue;
    
    // Check if this note is a tied continuation (previous note has tie: true and same pitch)
    if (i > 0 && notes[i - 1].tie === true && notes[i - 1].pitch === notes[i].pitch) {
      continue;
    }
    
    return i;
  }
  return -1;
}
