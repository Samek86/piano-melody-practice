// Audio capture module
export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;

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
      
      // iOS requires explicit resume after user gesture
      if (this.audioContext.state === 'suspended') {
        console.log('[AudioCapture] Resuming suspended AudioContext (iOS)');
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      console.log(`[AudioCapture] Initialized with sample rate: ${this.audioContext.sampleRate} Hz, state: ${this.audioContext.state}`);

      // Set up AnalyserNode
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;

      this.sourceNode.connect(this.analyser);
    } catch (error) {
      console.error('[AudioCapture] Initialization error:', error);
      throw new Error(`마이크 접근 실패: ${(error as Error).message}`);
    }
  }

  getSampleRate(): number {
    if (!this.audioContext) throw new Error('AudioCapture not initialized');
    return this.audioContext.sampleRate;
  }

  getAudioBuffer(): Float32Array {
    if (!this.analyser) throw new Error('AudioCapture not initialized');
    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);
    return buffer;
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
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.audioContext = null;
    this.mediaStream = null;
    this.analyser = null;
    this.sourceNode = null;
  }

  get state(): string {
    return this.audioContext?.state || 'closed';
  }
}
