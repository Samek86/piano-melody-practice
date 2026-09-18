import type { MatchResult } from '../../types';
import { midiToFrequency, calculateCentsOff, frequencyToMidi } from '../../utils.ts';

export interface NoteMatchingConfig {
  toleranceCents: number;
  sustainWindowMs: number;
  debounceMs: number;
  a4Hz?: number;
}

const RELEASE_DIP_RATIO = 0.75;
const ATTACK_RATIO = 1.25;
const QUIET_PEAK = 0.025;
const RELEASE_TIMEOUT_MS = 350;

export class NoteMatcher {
  private config: NoteMatchingConfig;
  private currentTargetNote: number | null = null;
  private matchStartTime: number | null = null;
  private lastMatchTime: number = 0;
  private lastMatchedPitchClass: number | null = null;
  private requiresRelease: boolean = false;
  private releasedSeen: boolean = false;
  private peakAtMatch: number = 0;
  private minPeakSinceMatch: number = 0;
  private releaseGateArmedTime: number = 0;

  constructor(config: NoteMatchingConfig) {
    this.config = config;
  }

  setTargetNote(midiNote: number): void {
    this.currentTargetNote = midiNote;
    this.matchStartTime = null;
    const newPitchClass = this.getPitchClass(midiNote);
    if (this.lastMatchedPitchClass !== null && newPitchClass !== this.lastMatchedPitchClass) {
      this.clearReleaseGate();
    }
  }

  private getPitchClass(midiNote: number): number {
    return midiNote % 12;
  }

  private isPitchClassMatch(detected: number, target: number): boolean {
    return this.getPitchClass(detected) === this.getPitchClass(target);
  }

  private clearReleaseGate(): void {
    this.requiresRelease = false;
    this.releasedSeen = false;
  }

  private armReleaseGate(peakLevel: number): void {
    this.requiresRelease = true;
    this.releasedSeen = false;
    this.peakAtMatch = peakLevel;
    this.minPeakSinceMatch = peakLevel;
    this.releaseGateArmedTime = Date.now();
  }

  private updateReleaseGate(detectedFrequency: number | null, peakLevel: number): void {
    if (!this.requiresRelease) return;

    const now = Date.now();
    const timeSinceArmed = now - this.releaseGateArmedTime;

    this.minPeakSinceMatch = Math.min(this.minPeakSinceMatch, peakLevel);

    const noPitch = !detectedFrequency;
    const quiet = peakLevel <= QUIET_PEAK;
    const dipped = this.peakAtMatch > 0 && peakLevel <= this.peakAtMatch * RELEASE_DIP_RATIO;
    if (noPitch || quiet || dipped) {
      this.releasedSeen = true;
    }

    const trough = Math.max(this.minPeakSinceMatch, 0.005);
    const strongEnough = peakLevel >= Math.max(0.035, this.peakAtMatch * 0.25);
    const attack = peakLevel >= trough * ATTACK_RATIO;
    
    if (this.releasedSeen && attack && strongEnough) {
      this.clearReleaseGate();
    }
    
    // Auto-clear release gate after timeout if pitch is still detected with sufficient energy
    // This helps when playing consecutive notes on a real piano without perfect silence
    if (timeSinceArmed > RELEASE_TIMEOUT_MS && detectedFrequency != null && strongEnough) {
      this.clearReleaseGate();
    }
  }

  checkMatch(detectedFrequency: number | null, peakLevel: number = 0): MatchResult {
    const now = Date.now();

    if (!this.currentTargetNote) {
      this.matchStartTime = null;
      this.clearReleaseGate();
      return this.createResult(false, 0);
    }

    this.updateReleaseGate(detectedFrequency, peakLevel);

    if (now - this.lastMatchTime < this.config.debounceMs) {
      return this.createResult(false, 0);
    }

    if (!detectedFrequency) {
      this.matchStartTime = null;
      return this.createResult(false, 0);
    }

    const a4 = this.config.a4Hz ?? 440;
    const detectedMidi = frequencyToMidi(detectedFrequency, a4);
    const detectedPitchClass = this.getPitchClass(detectedMidi);
    const isPitchClassCorrect = this.isPitchClassMatch(detectedMidi, this.currentTargetNote);

    if (!isPitchClassCorrect) {
      this.matchStartTime = null;
      this.clearReleaseGate();
      const targetFreq = midiToFrequency(this.currentTargetNote, a4);
      const centsOff = calculateCentsOff(detectedFrequency, targetFreq);
      return this.createResult(false, 0, detectedMidi, centsOff);
    }

    if (this.requiresRelease && detectedPitchClass === this.lastMatchedPitchClass) {
      this.matchStartTime = null;
      const targetFreq = midiToFrequency(this.currentTargetNote, a4);
      const centsOff = calculateCentsOff(detectedFrequency, targetFreq);
      return this.createResult(false, 0, detectedMidi, centsOff);
    }

    if (this.requiresRelease) {
      this.clearReleaseGate();
    }

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
        this.armReleaseGate(peakLevel);
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
      this.clearReleaseGate();
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
    this.peakAtMatch = 0;
    this.minPeakSinceMatch = 0;
    this.releaseGateArmedTime = 0;
    this.clearReleaseGate();
  }
}
