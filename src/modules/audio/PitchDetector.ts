import PitchFinder from 'pitchfinder';
import { PitchDetectionResult } from '../../types';

export interface PitchDetectionConfig {
  sampleRate: number;
  threshold: number;
  analysisInterval: number;
  noiseGate: number;
}

export interface ExtendedPitchResult extends PitchDetectionResult {
  inputLevel: number;
  detectionMethod?: 'yin' | 'fft' | 'autocorrelation';
}

export class PitchDetector {
  private detectPitch: (buffer: Float32Array) => number | null;
  private config: PitchDetectionConfig;
  private lastDetectionTime = 0;
  
  // Frequency range for piano (expanded slightly beyond piano range)
  private readonly MIN_FREQ = 27.5;  // A0, lowest piano key
  private readonly MAX_FREQ = 4200;  // C8 is ~4186 Hz, add margin

  constructor(config: PitchDetectionConfig) {
    this.config = config;
    this.detectPitch = PitchFinder.YIN({
      sampleRate: config.sampleRate,
      threshold: config.threshold
    });
  }

  detect(audioBuffer: Float32Array, frequencyData?: Uint8Array): ExtendedPitchResult | null {
    const now = Date.now();
    if (now - this.lastDetectionTime < this.config.analysisInterval) {
      return null;
    }
    this.lastDetectionTime = now;

    // Calculate RMS for noise gate and UI feedback
    const rms = this.calculateRMS(audioBuffer);
    const inputLevel = rms;

    if (rms < this.dbToLinear(this.config.noiseGate)) {
      return { 
        frequency: null, 
        clarity: 0, 
        timestamp: now,
        inputLevel 
      };
    }

    // Try YIN first (primary detector)
    let frequency = this.detectPitch(audioBuffer);
    let method: 'yin' | 'fft' | 'autocorrelation' = 'yin';
    let clarity = 0.95;

    // Validate YIN result
    if (frequency && this.isValidFrequency(frequency)) {
      return {
        frequency,
        clarity,
        timestamp: now,
        inputLevel,
        detectionMethod: method
      };
    }

    // YIN failed or returned invalid frequency - try FFT fallback
    if (frequencyData) {
      const fftFreq = this.detectPitchFFT(frequencyData);
      if (fftFreq && this.isValidFrequency(fftFreq)) {
        frequency = fftFreq;
        method = 'fft';
        clarity = 0.75; // Lower confidence for FFT
      }
    }

    // If still no valid frequency, try autocorrelation fallback
    if (!frequency || !this.isValidFrequency(frequency)) {
      const acFreq = this.detectPitchAutocorrelation(audioBuffer);
      if (acFreq && this.isValidFrequency(acFreq)) {
        frequency = acFreq;
        method = 'autocorrelation';
        clarity = 0.80;
      }
    }

    return {
      frequency: frequency && this.isValidFrequency(frequency) ? frequency : null,
      clarity: frequency && this.isValidFrequency(frequency) ? clarity : 0,
      timestamp: now,
      inputLevel,
      detectionMethod: frequency && this.isValidFrequency(frequency) ? method : undefined
    };
  }

  private isValidFrequency(freq: number | null): boolean {
    if (!freq || !Number.isFinite(freq)) return false;
    // Reject absurd frequencies (silence artifacts, harmonics gone wild)
    return freq >= this.MIN_FREQ && freq <= this.MAX_FREQ;
  }

  /**
   * FFT-based pitch detection fallback.
   * Finds the strongest peak in the frequency spectrum.
   */
  private detectPitchFFT(frequencyData: Uint8Array): number | null {
    const sampleRate = this.config.sampleRate;
    const nyquist = sampleRate / 2;
    const binCount = frequencyData.length;
    
    // Find the bin with maximum magnitude
    let maxMag = 0;
    let maxBin = -1;
    
    // Only search in valid piano frequency range
    const minBin = Math.floor((this.MIN_FREQ / nyquist) * binCount);
    const maxBinLimit = Math.ceil((this.MAX_FREQ / nyquist) * binCount);
    
    for (let i = minBin; i < Math.min(maxBinLimit, binCount); i++) {
      if (frequencyData[i] > maxMag) {
        maxMag = frequencyData[i];
        maxBin = i;
      }
    }
    
    // Require minimum magnitude threshold (roughly -40 dB)
    if (maxMag < 30) return null;
    
    if (maxBin === -1) return null;
    
    // Convert bin to frequency
    const frequency = (maxBin * nyquist) / binCount;
    return frequency;
  }

  /**
   * Autocorrelation-based pitch detection fallback.
   * Simplified version for when YIN fails.
   */
  private detectPitchAutocorrelation(buffer: Float32Array): number | null {
    const sampleRate = this.config.sampleRate;
    const bufferSize = buffer.length;
    
    // Minimum and maximum lag based on frequency range
    const minLag = Math.floor(sampleRate / this.MAX_FREQ);
    const maxLag = Math.floor(sampleRate / this.MIN_FREQ);
    
    let bestLag = -1;
    let bestCorrelation = -1;
    
    // Calculate autocorrelation for each lag
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
    
    // Require reasonable correlation strength
    const normalization = this.calculateRMS(buffer);
    if (normalization < 0.01 || bestCorrelation / (normalization * normalization) < 0.3) {
      return null;
    }
    
    if (bestLag === -1) return null;
    
    const frequency = sampleRate / bestLag;
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
