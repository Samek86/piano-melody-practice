const KEY_ACCIDENTALS: Record<string, number> = {
  C: 0,
  Am: 0,
  F: 1,
  Dm: 1,
  Bb: 2,
  Gm: 2,
  Eb: 3,
  Cm: 3,
  Ab: 4,
  Fm: 4,
  Db: 5,
  Bbm: 5,
  Gb: 6,
  Ebm: 6,
  Cb: 7,
  Abm: 7,
  G: 1,
  Em: 1,
  D: 2,
  Bm: 2,
  A: 3,
  'F#m': 3,
  E: 4,
  'C#m': 4,
  B: 5,
  'G#m': 5,
  'F#': 6,
  'D#m': 6,
  'C#': 7,
  'A#m': 7
};

const CLEF_WIDTH = 36;
const ACCIDENTAL_WIDTH = 16;
const TIME_WIDTH = 28;

export function vexKeySignature(key?: string): string | null {
  if (!key) return null;
  const spec = key.trim();
  const count = KEY_ACCIDENTALS[spec];
  if (count == null || count === 0) return null;
  return spec;
}

export function stavePreludeWidth(opts: { key?: string; isFirstMeasure: boolean }): number {
  const spec = vexKeySignature(opts.key);
  const keyWidth = spec ? ACCIDENTAL_WIDTH * (KEY_ACCIDENTALS[spec] ?? 0) : 0;
  const timeWidth = opts.isFirstMeasure ? TIME_WIDTH : 0;
  return CLEF_WIDTH + keyWidth + timeWidth;
}
