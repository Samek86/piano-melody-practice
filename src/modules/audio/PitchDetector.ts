import PitchFinder from 'pitchfinder';
import { PitchDetectionResult } from '../../types';

export interface PitchDetectionConfig {
  sampleRate: number;
  threshold: number;
  analysisInterval: number;
  noiseGate: number;
  /** Lowest plausible piano fundamental (Hz). Default C2≈65. */
  minFrequency?: number;
  /** Highest plausible piano fundamental (Hz). Default ~C7. */
  maxFrequency?: number;
}

export class PitchDetector {
  private detectPitch: (buffer: Float32Array) => number | null;
  private config: PitchDetectionConfig;
  private lastDetectionTime = 0;
  private readonly minFrequency: number;
  private readonly maxFrequency: number;

  constructor(config: PitchDetectionConfig) {
    this.config = config;
    this.minFrequency = config.minFrequency ?? 65;
    this.maxFrequency = config.maxFrequency ?? 2100;
    this.detectPitch = PitchFinder.YIN({
      sampleRate: config.sampleRate,
      threshold: config.threshold
    });
  }

  detect(audioBuffer: Float32Array): PitchDetectionResult | null {
    const now = Date.now();
    if (now - this.lastDetectionTime < this.config.analysisInterval) {
      return null;
    }
    this.lastDetectionTime = now;

    const rms = this.calculateRMS(audioBuffer);
    if (rms < this.dbToLinear(this.config.noiseGate)) {
      return { frequency: null, clarity: 0, timestamp: now };
    }

    const raw = this.detectPitch(audioBuffer);
    const frequency = this.sanitizeFrequency(raw);

    return {
      frequency,
      clarity: frequency ? 0.9 : 0,
      timestamp: now
    };
  }

  /**
   * YIN often returns absurd highs (e.g. ~19200Hz) on noise/silence remnants.
   * Those map to MIDI pitch-class 2 (레) and look like "everything is 레".
   */
  private sanitizeFrequency(frequency: number | null | undefined): number | null {
    if (frequency == null || !Number.isFinite(frequency) || frequency <= 0) {
      return null;
    }
    if (frequency < this.minFrequency || frequency > this.maxFrequency) {
      return null;
    }
    return frequency;
  }

  private calculateRMS(buffer: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }

  private dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }
}
