import { MatchResult } from '../../types';
import { midiToFrequency, calculateCentsOff, frequencyToMidi } from '../../utils';

export interface NoteMatchingConfig {
  toleranceCents: number;
  sustainWindowMs: number;
  debounceMs: number;
  a4Hz?: number;
}

export class NoteMatcher {
  private config: NoteMatchingConfig;
  private currentTargetNote: number | null = null;
  private matchStartTime: number | null = null;
  private lastMatchTime: number = 0;

  constructor(config: NoteMatchingConfig) {
    this.config = config;
  }

  setTargetNote(midiNote: number): void {
    this.currentTargetNote = midiNote;
    this.matchStartTime = null;
  }

  private getPitchClass(midiNote: number): number {
    return midiNote % 12;
  }

  private isPitchClassMatch(detected: number, target: number): boolean {
    return this.getPitchClass(detected) === this.getPitchClass(target);
  }

  checkMatch(detectedFrequency: number | null): MatchResult {
    const now = Date.now();

    // Debounce
    if (now - this.lastMatchTime < this.config.debounceMs) {
      return this.createResult(false, 0);
    }

    if (!this.currentTargetNote || !detectedFrequency) {
      this.matchStartTime = null;
      return this.createResult(false, 0);
    }

    // Convert detected frequency to MIDI for pitch class comparison
    const a4 = this.config.a4Hz ?? 440;
    const detectedMidi = frequencyToMidi(detectedFrequency, a4);
    
    // Check if pitch class matches (octave-invariant)
    const isPitchClassCorrect = this.isPitchClassMatch(detectedMidi, this.currentTargetNote);
    
    if (!isPitchClassCorrect) {
      this.matchStartTime = null;
      // Calculate cents off from exact target for feedback
      const targetFreq = midiToFrequency(this.currentTargetNote, a4);
      const centsOff = calculateCentsOff(detectedFrequency, targetFreq);
      return this.createResult(false, 0, detectedMidi, centsOff);
    }

    // Pitch class matches! Now find the closest octave of the target note
    // to calculate meaningful cents offset
    const targetPitchClass = this.getPitchClass(this.currentTargetNote);
    const detectedOctave = Math.floor(detectedMidi / 12);
    const closestTargetInDetectedOctave = detectedOctave * 12 + targetPitchClass;
    
    const closestTargetFreq = midiToFrequency(closestTargetInDetectedOctave, a4);
    const centsOff = calculateCentsOff(detectedFrequency, closestTargetFreq);

    // Check if it's within tolerance (using the closest octave)
    const isMatch = Math.abs(centsOff) <= this.config.toleranceCents;

    if (isMatch) {
      if (!this.matchStartTime) {
        this.matchStartTime = now;
      }
      const sustainedMs = now - this.matchStartTime;

      if (sustainedMs >= this.config.sustainWindowMs) {
        this.lastMatchTime = now;
        this.matchStartTime = null;
        return this.createResult(true, sustainedMs, detectedMidi, centsOff);
      }

      return this.createResult(false, sustainedMs, detectedMidi, centsOff);
    } else {
      this.matchStartTime = null;
      return this.createResult(false, 0, detectedMidi, centsOff);
    }
  }

  matchInstant(midiNote: number): MatchResult {
    const now = Date.now();

    if (now - this.lastMatchTime < this.config.debounceMs) {
      return this.createResult(false, 0);
    }

    if (!this.currentTargetNote) {
      return this.createResult(false, 0);
    }

    // Use octave-invariant matching: compare pitch classes
    const isMatch = this.isPitchClassMatch(midiNote, this.currentTargetNote);

    if (isMatch) {
      this.lastMatchTime = now;
      this.matchStartTime = null;
      return this.createResult(true, 0, midiNote, 0);
    } else {
      return this.createResult(false, 0, midiNote, undefined);
    }
  }

  private createResult(
    matched: boolean,
    sustainedMs: number,
    detectedNote?: number,
    centsOff?: number
  ): MatchResult {
    return {
      matched,
      targetNote: this.currentTargetNote!,
      detectedNote: detectedNote ?? null,
      centsOff: centsOff ?? null,
      sustainedMs
    };
  }

  reset(): void {
    this.matchStartTime = null;
    this.lastMatchTime = 0;
  }
}
