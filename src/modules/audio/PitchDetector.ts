import PitchFinder from 'pitchfinder';
import { PitchDetectionResult } from '../../types';

export interface PitchDetectionConfig {
  sampleRate: number;
  threshold: number;
  analysisInterval: number;
  noiseGate: number;
  minFrequency?: number;
  maxFrequency?: number;
}

export class PitchDetector {
  private detectPitch: (buffer: Float32Array) => number | null;
  private detectPitchLoose: (buffer: Float32Array) => number | null;
  private config: PitchDetectionConfig;
  private lastDetectionTime = 0;
  private readonly minFrequency: number;
  private readonly maxFrequency: number;

  constructor(config: PitchDetectionConfig) {
    this.config = config;
    this.minFrequency = config.minFrequency ?? 55;
    this.maxFrequency = config.maxFrequency ?? 2500;
    this.detectPitch = PitchFinder.YIN({
      sampleRate: config.sampleRate,
      threshold: config.threshold
    });
    this.detectPitchLoose = PitchFinder.YIN({
      sampleRate: config.sampleRate,
      threshold: Math.min(0.15, config.threshold)
    });
  }

  detect(audioBuffer: Float32Array): PitchDetectionResult | null {
    const now = Date.now();
    if (now - this.lastDetectionTime < this.config.analysisInterval) {
      return null;
    }
    this.lastDetectionTime = now;

    const rms = this.calculateRMS(audioBuffer);
    const peak = this.calculatePeak(audioBuffer);
    const gate = this.dbToLinear(this.config.noiseGate);
    if (rms < gate && peak < gate * 4) {
      return { frequency: null, clarity: 0, timestamp: now };
    }

    let frequency = this.sanitizeFrequency(this.detectPitch(audioBuffer));
    let clarity = 0.9;
    if (frequency == null) {
      frequency = this.sanitizeFrequency(this.detectPitchLoose(audioBuffer));
      clarity = 0.8;
    }
    if (frequency == null) {
      frequency = this.sanitizeFrequency(this.detectPitchAutocorrelation(audioBuffer));
      clarity = 0.75;
    }

    return {
      frequency,
      clarity: frequency ? clarity : 0,
      timestamp: now
    };
  }

  private detectPitchAutocorrelation(buffer: Float32Array): number | null {
    const sampleRate = this.config.sampleRate;
    const bufferSize = buffer.length;
    const minLag = Math.floor(sampleRate / this.maxFrequency);
    const maxLag = Math.floor(sampleRate / this.minFrequency);

    let bestLag = -1;
    let bestCorrelation = -1;

    for (let lag = minLag; lag < Math.min(maxLag, bufferSize / 2); lag++) {
      let correlation = 0;
      for (let i = 0; i < bufferSize - lag; i++) {
        correlation += buffer[i] * buffer[i + lag];
      }
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    const normalization = this.calculateRMS(buffer);
    if (normalization < 0.005 || bestLag < 0) return null;
    if (bestCorrelation / (normalization * normalization * (bufferSize - bestLag)) < 0.2) {
      return null;
    }
    return sampleRate / bestLag;
  }

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

  private calculatePeak(buffer: Float32Array): number {
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const a = Math.abs(buffer[i]);
      if (a > peak) peak = a;
    }
    return peak;
  }

  private dbToLinear(db: number): number {
    return Math.pow(10, db / 20);
  }
}
