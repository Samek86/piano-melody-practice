// Audio capture module
export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private freqBuffer: Float32Array | null = null;

  get isReady(): boolean {
    return !!(this.audioContext && this.analyser);
  }

  async initialize(): Promise<void> {
    try {
      // Prefer the voice/unprocessed mic; AGC helps quiet piano through phone mics
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
          channelCount: 1
        }
      });

      this.audioContext = new AudioContext();
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      console.log(
        `[AudioCapture] Initialized sampleRate=${this.audioContext.sampleRate} state=${this.audioContext.state}`
      );

      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0.3;
      this.analyser.minDecibels = -100;
      this.analyser.maxDecibels = -10;
      this.sourceNode.connect(this.analyser);
      this.freqBuffer = new Float32Array(this.analyser.frequencyBinCount);
    } catch (error) {
      this.cleanup();
      throw new Error(`마이크 접근 실패: ${(error as Error).message}`);
    }
  }

  getSampleRate(): number {
    return this.audioContext?.sampleRate ?? 44100;
  }

  getAudioBuffer(): Float32Array | null {
    if (!this.analyser) return null;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    return buffer;
  }

  /** Peak magnitude in dB and dominant frequency via FFT (robust fallback). */
  getSpectrumPeak(): { peakDb: number; frequency: number | null } {
    if (!this.analyser || !this.freqBuffer || !this.audioContext) {
      return { peakDb: -Infinity, frequency: null };
    }
    // Cast needed across TS lib versions for Float32Array generics
    this.analyser.getFloatFrequencyData(this.freqBuffer as unknown as Float32Array<ArrayBuffer>);

    const sampleRate = this.audioContext.sampleRate;
    const binHz = sampleRate / this.analyser.fftSize;
    // Reject below 90 Hz to avoid D2 (~73 Hz) / rumble false 레; allow D3+ (~147 Hz)
    const MIN_RELIABLE_FREQ_HZ = 90;
    const minBin = Math.max(1, Math.floor(MIN_RELIABLE_FREQ_HZ / binHz));
    const maxBin = Math.min(this.freqBuffer.length - 1, Math.floor(2000 / binHz));

    let bestBin = -1;
    let bestDb = -Infinity;
    for (let i = minBin; i <= maxBin; i++) {
      const db = this.freqBuffer[i];
      if (db > bestDb) {
        bestDb = db;
        bestBin = i;
      }
    }

    if (bestBin < 0 || bestDb < -75) {
      return { peakDb: bestDb, frequency: null };
    }
    
    let frequency = bestBin * binHz;
    
    // For frequencies 90-150 Hz, require clear spectral peak to avoid rumble
    // (Real piano notes have clear peaks; rumble has broad low-frequency energy)
    if (frequency < 150) {
      const peakProminence = this.calculatePeakProminence(bestBin, bestDb);
      if (peakProminence < 6) {
        // Not a clear enough peak, likely noise
        return { peakDb: bestDb, frequency: null };
      }
    }
    
    // Estimate the fundamental instead of just returning the loudest bin
    // Phone mics often pick up 2nd/3rd harmonic louder than the fundamental
    frequency = this.estimateFundamental(frequency, bestDb, binHz);
    
    return { peakDb: bestDb, frequency };
  }

  /** Calculate how prominent the peak is compared to neighboring bins */
  private calculatePeakProminence(peakBin: number, peakDb: number): number {
    if (!this.freqBuffer) return 0;
    
    const checkRadius = 3;
    let minNeighborDb = 0;
    let neighborCount = 0;
    
    for (let offset = -checkRadius; offset <= checkRadius; offset++) {
      if (offset === 0) continue;
      const bin = peakBin + offset;
      if (bin >= 0 && bin < this.freqBuffer.length) {
        minNeighborDb += this.freqBuffer[bin];
        neighborCount++;
      }
    }
    
    if (neighborCount === 0) return 0;
    const avgNeighborDb = minNeighborDb / neighborCount;
    return peakDb - avgNeighborDb;
  }

  /**
   * Estimate the fundamental frequency from a strong peak that might be a harmonic.
   * If the peak F has significant energy near F/2 or F/3, prefer the lower candidate.
   */
  private estimateFundamental(peakFreq: number, peakDb: number, binHz: number): number {
    if (!this.freqBuffer || !this.audioContext) return peakFreq;
    
    const MIN_RELIABLE_FREQ_HZ = 90;
    const candidates: Array<{ freq: number; evidence: number }> = [
      { freq: peakFreq, evidence: 1.0 }
    ];
    
    // Check if peakFreq might be 2nd harmonic (F/2 exists)
    const halfFreq = peakFreq / 2;
    if (halfFreq >= MIN_RELIABLE_FREQ_HZ) {
      const halfEnergy = this.getEnergyNear(halfFreq, binHz, peakDb);
      if (halfEnergy > 0) {
        candidates.push({ freq: halfFreq, evidence: halfEnergy });
      }
    }
    
    // Check if peakFreq might be 3rd harmonic (F/3 exists)
    const thirdFreq = peakFreq / 3;
    if (thirdFreq >= MIN_RELIABLE_FREQ_HZ) {
      const thirdEnergy = this.getEnergyNear(thirdFreq, binHz, peakDb);
      if (thirdEnergy > 0) {
        candidates.push({ freq: thirdFreq, evidence: thirdEnergy });
      }
    }
    
    // Prefer the lowest candidate with significant evidence
    candidates.sort((a, b) => a.freq - b.freq);
    for (const candidate of candidates) {
      if (candidate.evidence > 0.3) {
        return candidate.freq;
      }
    }
    
    return peakFreq;
  }

  /**
   * Get normalized energy near a target frequency (for harmonic checking).
   * Returns 0 if no significant energy, or a ratio (0-1) indicating strength relative to referenceDb.
   */
  private getEnergyNear(targetFreq: number, binHz: number, referenceDb: number): number {
    if (!this.freqBuffer) return 0;
    
    const targetBin = Math.round(targetFreq / binHz);
    if (targetBin < 0 || targetBin >= this.freqBuffer.length) return 0;
    
    // Check a small window around the target frequency (±3 bins for ~5% tolerance)
    const windowRadius = 3;
    let maxDb = -Infinity;
    
    for (let offset = -windowRadius; offset <= windowRadius; offset++) {
      const bin = targetBin + offset;
      if (bin >= 0 && bin < this.freqBuffer.length) {
        const db = this.freqBuffer[bin];
        if (db > maxDb) maxDb = db;
      }
    }
    
    // Require at least -15 dB relative to the reference peak
    const relativeDb = maxDb - referenceDb;
    if (relativeDb < -15) return 0;
    
    // Return a normalized evidence score (0-1)
    return Math.min(1.0, Math.max(0, (relativeDb + 15) / 15));
  }

  getLevel(): { rms: number; peak: number } {
    const buffer = this.getAudioBuffer();
    if (!buffer) return { rms: 0, peak: 0 };
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = buffer[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    return { rms: Math.sqrt(sum / buffer.length), peak };
  }

  async suspend(): Promise<void> {
    await this.audioContext?.suspend();
  }

  async resume(): Promise<void> {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  cleanup(): void {
    try {
      this.mediaStream?.getTracks().forEach((track) => track.stop());
    } catch {
      /* ignore */
    }
    try {
      void this.audioContext?.close();
    } catch {
      /* ignore */
    }
    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.sourceNode = null;
    this.freqBuffer = null;
  }

  get state(): string {
    return this.audioContext?.state || 'closed';
  }
}
