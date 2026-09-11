import React from 'react';
import { midiToFrequency } from '../utils';

interface SoftKeyboardProps {
  onNotePlay: (midiNote: number) => void;
}

const KEYS = [
  { midi: 60, note: '도', key: 'A' },
  { midi: 62, note: '레', key: 'S' },
  { midi: 64, note: '미', key: 'D' },
  { midi: 65, note: '파', key: 'F' },
  { midi: 67, note: '솔', key: 'G' },
  { midi: 69, note: '라', key: 'H' },
  { midi: 71, note: '시', key: 'J' },
  { midi: 72, note: '도', key: 'K' }
];

export const SoftKeyboard: React.FC<SoftKeyboardProps> = ({ onNotePlay }) => {
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const [pressedKey, setPressedKey] = React.useState<number | null>(null);

  React.useEffect(() => {
    audioContextRef.current = new AudioContext();

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = KEYS.find(k => k.key === e.key.toUpperCase());
      if (key && pressedKey !== key.midi) {
        playTone(key.midi);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      audioContextRef.current?.close();
    };
  }, [pressedKey]);

  const playTone = (midiNote: number) => {
    if (!audioContextRef.current) return;

    const ctx = audioContextRef.current;
    const freq = midiToFrequency(midiNote);

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = freq;

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.5);

    setPressedKey(midiNote);
    onNotePlay(midiNote);

    setTimeout(() => setPressedKey(null), 200);
  };

  return (
    <div className="keyboard">
      {KEYS.map(({ midi, note, key }) => (
        <div
          key={midi}
          className="key"
          onClick={() => playTone(midi)}
          style={{
            background: pressedKey === midi ? '#cbd5e0' : 'white',
            transform: pressedKey === midi ? 'translateY(2px)' : 'none'
          }}
        >
          <div className="key-label">{note}</div>
          <div style={{ fontSize: '0.65rem', color: '#a0aec0' }}>{key}</div>
        </div>
      ))}
    </div>
  );
};
