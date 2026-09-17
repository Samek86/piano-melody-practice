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
    // Raise minBin to 150 Hz to avoid false D2 detections from low-frequency rumble
    // (phone handling, HVAC, traffic noise commonly peaks at 60-100 Hz)
    const minBin = Math.max(1, Math.floor(150 / binHz));
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
    
    const frequency = bestBin * binHz;
    
    // Additional validation: check for spectral clarity
    // Real piano notes have clear peaks; rumble has broad low-frequency energy
    const peakProminence = this.calculatePeakProminence(bestBin, bestDb);
    if (peakProminence < 6) {
      // Not a clear enough peak, likely noise
      return { peakDb: bestDb, frequency: null };
    }
    
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
