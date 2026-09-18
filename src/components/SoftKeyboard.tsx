import React from 'react';
import { midiToFrequency } from '../utils';
import { useAppStore } from '../store/appStore';

interface SoftKeyboardProps {
  onNotePlay: (midiNote: number) => void;
}

const WHITE_KEYS = [
  { midi: 60, note: '도C', key: 'A' },
  { midi: 62, note: '레D', key: 'S' },
  { midi: 64, note: '미E', key: 'D' },
  { midi: 65, note: '파F', key: 'F' },
  { midi: 67, note: '솔G', key: 'G' },
  { midi: 69, note: '라A', key: 'H' },
  { midi: 71, note: '시B', key: 'J' },
  { midi: 72, note: '도C', key: 'K' }
];

const BLACK_KEYS = [
  { midi: 61, note: '도#/C#', leftOffset: 0 },
  { midi: 63, note: '레#/D#', leftOffset: 1 },
  { midi: 66, note: '파#/F#', leftOffset: 3 },
  { midi: 68, note: '솔#/G#', leftOffset: 4 },
  { midi: 70, note: '라#/A#', leftOffset: 5 }
];

export const SoftKeyboard: React.FC<SoftKeyboardProps> = ({ onNotePlay }) => {
  const a4Hz = useAppStore((s) => s.settings.a4Hz);
  const audioContextRef = React.useRef<AudioContext | null>(null);
  const [pressedKey, setPressedKey] = React.useState<number | null>(null);

  React.useEffect(() => {
    audioContextRef.current = new AudioContext();

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = WHITE_KEYS.find(k => k.key === e.key.toUpperCase());
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
    // Always notify practice logic first — audio may fail (autoplay / headless).
    setPressedKey(midiNote);
    onNotePlay(midiNote);
    setTimeout(() => setPressedKey(null), 200);

    const ctx = audioContextRef.current;
    if (!ctx) return;
    try {
      if (ctx.state === 'suspended') void ctx.resume();
      const freq = midiToFrequency(midiNote, a4Hz);
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
    } catch {
      // ignore audio errors
    }
  };

  return (
    <div className="keyboard">
      {WHITE_KEYS.map(({ midi, note, key }) => (
        <div
          key={midi}
          className="key white-key"
          onClick={() => playTone(midi)}
          style={{
            background: pressedKey === midi ? '#cbd5e0' : '#fffef7',
            transform: pressedKey === midi ? 'translateY(2px)' : 'none'
          }}
        >
          <div className="key-label">{note}</div>
          <div style={{ fontSize: '0.65rem', color: '#a0aec0' }}>{key}</div>
        </div>
      ))}
      {BLACK_KEYS.map(({ midi, note, leftOffset }) => (
        <div
          key={midi}
          className="key black-key"
          onClick={() => playTone(midi)}
          style={{
            background: pressedKey === midi ? '#4a5568' : '#1a202c',
            transform: pressedKey === midi ? 'translateY(2px)' : 'none',
            left: `calc(${leftOffset} * (100% / ${WHITE_KEYS.length}) + (100% / ${WHITE_KEYS.length}) * 0.7)`
          }}
        >
          <div className="key-label" style={{ color: 'white', fontSize: '0.6rem' }}>{note}</div>
        </div>
      ))}
    </div>
  );
};
