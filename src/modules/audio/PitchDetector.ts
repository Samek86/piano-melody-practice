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

    // Additional validation for low frequencies to prevent false D2 detections
    // from rumble/handling noise
    if (frequency && frequency < 150) {
      // For low frequencies, require higher confidence
      const spectralClarity = this.calculateSpectralClarity(audioBuffer, frequency);
      if (spectralClarity < 0.3) {
        // Likely noise, not a real low piano note
        return { frequency: null, clarity: 0, timestamp: now };
      }
      // Reduce clarity score for low frequencies
      clarity *= 0.8;
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
    // Avoid low frequencies that are prone to false D2 detections
    const effectiveMinFreq = Math.max(this.minFrequency, 150);
    const minLag = Math.floor(sampleRate / this.maxFrequency);
    const maxLag = Math.floor(sampleRate / effectiveMinFreq);

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
    // Require stronger correlation for piano notes
    if (bestCorrelation / (normalization * normalization * (bufferSize - bestLag)) < 0.25) {
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

  /**
   * Calculate spectral clarity to distinguish piano tones from rumble.
   * Real piano notes have clear harmonic structure; low-frequency rumble is broad.
   */
  private calculateSpectralClarity(buffer: Float32Array, fundamentalFreq: number): number {
    const sampleRate = this.config.sampleRate;
    
    // Calculate simple DFT at fundamental and 2nd harmonic
    const omega1 = (2 * Math.PI * fundamentalFreq) / sampleRate;
    const omega2 = (2 * Math.PI * fundamentalFreq * 2) / sampleRate;
    
    let real1 = 0, imag1 = 0;
    let real2 = 0, imag2 = 0;
    let totalEnergy = 0;
    
    const sampleCount = Math.min(buffer.length, 2048);
    for (let i = 0; i < sampleCount; i++) {
      const sample = buffer[i];
      totalEnergy += sample * sample;
      
      real1 += sample * Math.cos(omega1 * i);
      imag1 += sample * Math.sin(omega1 * i);
      
      real2 += sample * Math.cos(omega2 * i);
      imag2 += sample * Math.sin(omega2 * i);
    }
    
    if (totalEnergy < 0.001) return 0;
    
    const mag1 = Math.sqrt(real1 * real1 + imag1 * imag1);
    const mag2 = Math.sqrt(real2 * real2 + imag2 * imag2);
    const harmonicEnergy = (mag1 * mag1 + mag2 * mag2) / sampleCount;
    
    // Return ratio of harmonic energy to total energy
    return harmonicEnergy / totalEnergy;
  }
}
