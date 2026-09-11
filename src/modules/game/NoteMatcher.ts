import { MatchResult } from '../../types';
import { midiToFrequency, calculateCentsOff } from '../../utils';

export interface NoteMatchingConfig {
  toleranceCents: number;
  sustainWindowMs: number;
  debounceMs: number;
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

    const targetFreq = midiToFrequency(this.currentTargetNote);
    const centsOff = calculateCentsOff(detectedFrequency, targetFreq);

    const isMatch = Math.abs(centsOff) <= this.config.toleranceCents;

    if (isMatch) {
      if (!this.matchStartTime) {
        this.matchStartTime = now;
      }
      const sustainedMs = now - this.matchStartTime;

      if (sustainedMs >= this.config.sustainWindowMs) {
        this.lastMatchTime = now;
        this.matchStartTime = null;
        return this.createResult(true, sustainedMs, this.currentTargetNote, centsOff);
      }

      return this.createResult(false, sustainedMs, this.currentTargetNote, centsOff);
    } else {
      this.matchStartTime = null;
      return this.createResult(false, 0, this.currentTargetNote, centsOff);
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
