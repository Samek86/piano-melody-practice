import { AudioCapture } from './AudioCapture';

let pending: AudioCapture | null = null;

/** Start mic+AudioContext inside a user gesture (iOS). */
export async function bootstrapAudioCapture(): Promise<AudioCapture> {
  // Drop any previous pending session
  pending?.cleanup();
  pending = null;

  const capture = new AudioCapture();
  await capture.initialize();
  await capture.resume();
  pending = capture;
  return capture;
}

/** PracticeScreen takes ownership of the bootstrapped capture (or null). */
export function takeBootstrappedAudioCapture(): AudioCapture | null {
  const cap = pending;
  pending = null;
  return cap;
}

export function discardBootstrappedAudioCapture(): void {
  pending?.cleanup();
  pending = null;
}
