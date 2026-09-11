import PitchFinder from 'pitchfinder';
import { PitchDetectionResult } from '../../types';

export interface PitchDetectionConfig {
  sampleRate: number;
  threshold: number;
  analysisInterval: number;
  noiseGate: number;
}

export class PitchDetector {
  private detectPitch: (buffer: Float32Array) => number | null;
  private config: PitchDetectionConfig;
  private lastDetectionTime = 0;

  constructor(config: PitchDetectionConfig) {
    this.config = config;
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

    // Check volume (noise gate)
    const rms = this.calculateRMS(audioBuffer);
    if (rms < this.dbToLinear(this.config.noiseGate)) {
      return { frequency: null, clarity: 0, timestamp: now };
    }

    const frequency = this.detectPitch(audioBuffer);

    return {
      frequency,
      clarity: frequency ? 0.95 : 0,
      timestamp: now
    };
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
