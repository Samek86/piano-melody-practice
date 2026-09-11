// Audio capture module
export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  get isReady(): boolean {
    return !!(this.audioContext && this.analyser);
  }

  async initialize(): Promise<void> {
    try {
      // Request microphone access (no sampleRate constraint - use device default)
      // iOS typically runs at 48000, Android/desktop often 44100
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      // Create AudioContext with default sample rate (device-dependent)
      this.audioContext = new AudioContext();

      // iOS: resume while we still have the user-gesture chain when possible
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      console.log(
        `[AudioCapture] Initialized with sample rate: ${this.audioContext.sampleRate} Hz, state: ${this.audioContext.state}`
      );

      // Set up AnalyserNode
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      this.sourceNode.connect(this.analyser);
    } catch (error) {
      this.cleanup();
      throw new Error(`마이크 접근 실패: ${(error as Error).message}`);
    }
  }

  getSampleRate(): number {
    // Never throw — callers may race with cleanup / async init
    return this.audioContext?.sampleRate ?? 44100;
  }

  getAudioBuffer(): Float32Array | null {
    if (!this.analyser) return null;
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    return buffer;
  }

  getFrequencyData(): Uint8Array | null {
    if (!this.analyser) return null;
    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buffer);
    return buffer;
  }

  getRMS(): number {
    const buffer = this.getAudioBuffer();
    if (!buffer) return 0;
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
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
  }

  get state(): string {
    return this.audioContext?.state || 'closed';
  }
}
