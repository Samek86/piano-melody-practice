import { MatchResult } from '../../types';
import { midiToFrequency, calculateCentsOff, frequencyToMidi } from '../../utils';

export interface NoteMatchingConfig {
  toleranceCents: number;
  sustainWindowMs: number;
  debounceMs: number;
  a4Hz?: number;
  silenceThresholdMs?: number; // sustained silence duration to clear release gate
}

export class NoteMatcher {
  private config: NoteMatchingConfig;
  private currentTargetNote: number | null = null;
  private matchStartTime: number | null = null;
  private lastMatchTime: number = 0;
  private lastMatchedPitchClass: number | null = null;
  private requiresRelease: boolean = false;
  private silenceStartTime: number | null = null;

  constructor(config: NoteMatchingConfig) {
    this.config = config;
  }

  setTargetNote(midiNote: number): void {
    this.currentTargetNote = midiNote;
    this.matchStartTime = null;
    // Only clear release requirement when the new target's pitch class differs
    // from the last matched pitch class. For repeated identical notes (C-C-C),
    // we must keep the release gate active.
    const newPitchClass = this.getPitchClass(midiNote);
    if (this.lastMatchedPitchClass !== null && newPitchClass !== this.lastMatchedPitchClass) {
      this.requiresRelease = false;
    }
  }

  private getPitchClass(midiNote: number): number {
    return midiNote % 12;
  }

  private isPitchClassMatch(detected: number, target: number): boolean {
    return this.getPitchClass(detected) === this.getPitchClass(target);
  }

  notifySilence(): void {
    const now = Date.now();
    const silenceThreshold = this.config.silenceThresholdMs ?? 80;

    if (!this.silenceStartTime) {
      this.silenceStartTime = now;
    }

    const silenceDuration = now - this.silenceStartTime;
    
    // Clear release gate after sustained silence
    if (silenceDuration >= silenceThreshold) {
      this.requiresRelease = false;
    }

    this.matchStartTime = null;
  }

  checkMatch(detectedFrequency: number | null): MatchResult {
    const now = Date.now();

    // Debounce
    if (now - this.lastMatchTime < this.config.debounceMs) {
      return this.createResult(false, 0);
    }

    if (!this.currentTargetNote) {
      this.matchStartTime = null;
      this.silenceStartTime = null;
      this.requiresRelease = false;
      return this.createResult(false, 0);
    }

    // If no frequency detected (silence), track it for release gate clearing
    if (!detectedFrequency) {
      this.notifySilence();
      return this.createResult(false, 0);
    }

    // Pitch detected - reset silence tracking
    this.silenceStartTime = null;

    // Convert detected frequency to MIDI for pitch class comparison
    const a4 = this.config.a4Hz ?? 440;
    const detectedMidi = frequencyToMidi(detectedFrequency, a4);
    const detectedPitchClass = this.getPitchClass(detectedMidi);
    
    // Check if pitch class matches (octave-invariant)
    const isPitchClassCorrect = this.isPitchClassMatch(detectedMidi, this.currentTargetNote);
    
    if (!isPitchClassCorrect) {
      this.matchStartTime = null;
      // If we detect a different pitch class, clear release requirement
      this.requiresRelease = false;
      // Calculate cents off from exact target for feedback
      const targetFreq = midiToFrequency(this.currentTargetNote, a4);
      const centsOff = calculateCentsOff(detectedFrequency, targetFreq);
      return this.createResult(false, 0, detectedMidi, centsOff);
    }

    // Pitch class matches! Check if we need a release first
    if (this.requiresRelease && detectedPitchClass === this.lastMatchedPitchClass) {
      // Same pitch class held without release - block matching
      this.matchStartTime = null;
      const targetFreq = midiToFrequency(this.currentTargetNote, a4);
      const centsOff = calculateCentsOff(detectedFrequency, targetFreq);
      return this.createResult(false, 0, detectedMidi, centsOff);
    }

    // If we reach here with requiresRelease=true, it means we detected a different
    // pitch class that still matches (shouldn't happen), so clear the flag
    if (this.requiresRelease && detectedPitchClass !== this.lastMatchedPitchClass) {
      this.requiresRelease = false;
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
        // Record the matched pitch class and require release for next identical note
        this.lastMatchedPitchClass = detectedPitchClass;
        this.requiresRelease = true;
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
      // For instant matches (soft keyboard), each tap is discrete
      // Record the matched pitch class but clear release requirement
      // since the next tap will be a new action
      const pitchClass = this.getPitchClass(midiNote);
      this.lastMatchedPitchClass = pitchClass;
      this.requiresRelease = false;
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
    this.lastMatchedPitchClass = null;
    this.requiresRelease = false;
    this.silenceStartTime = null;
  }
}
