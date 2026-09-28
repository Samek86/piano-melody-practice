import type { Note } from '../../types';
import { midiToFrequency } from '../../utils';
import { planPlayback, quarterLength } from './staffModel';

export interface PreviewPlayer {
  play: (notes: Note[], tempo: number, fromIndex: number, onIndex?: (index: number) => void) => void;
  stop: () => void;
}

export function createPreviewPlayer(): PreviewPlayer {
  let ctx: AudioContext | null = null;
  let timers: number[] = [];
  let oscillators: OscillatorNode[] = [];

  function stop(): void {
    timers.forEach((timer) => window.clearTimeout(timer));
    timers = [];
    oscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
    });
    oscillators = [];
  }

  function play(notes: Note[], tempo: number, fromIndex: number, onIndex?: (index: number) => void): void {
    stop();
    const audio = ctx ?? new AudioContext();
    ctx = audio;
    void audio.resume();
    const slices = planPlayback(notes, fromIndex);
    const quarterSec = 60 / Math.max(1, tempo);
    let t = audio.currentTime + 0.05;

    for (const slice of slices) {
      const dur = Math.max(0.05, slice.quarters * quarterSec);
      if (slice.midi != null) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = 'triangle';
        osc.frequency.value = midiToFrequency(slice.midi);
        const attack = Math.min(0.02, dur / 4);
        const release = Math.min(0.05, dur / 3);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.12, t + attack);
        gain.gain.setValueAtTime(0.12, Math.max(t + attack, t + dur - release));
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain);
        gain.connect(audio.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
        oscillators.push(osc);
      }

      let local = 0;
      for (let index = slice.startIndex; index <= slice.endIndex; index++) {
        const at = t + local * quarterSec;
        const wait = Math.max(0, (at - audio.currentTime) * 1000);
        const noteIndex = index;
        timers.push(window.setTimeout(() => onIndex?.(noteIndex), wait));
        local += quarterLength(notes[index]);
      }
      t += dur;
    }

    const done = Math.max(0, (t - audio.currentTime) * 1000);
    timers.push(window.setTimeout(() => onIndex?.(-1), done));
  }

  return { play, stop };
}
