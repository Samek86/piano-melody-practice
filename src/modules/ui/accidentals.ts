/**
 * Accidentals module: proper note spelling and temporary accidentals (임시표)
 * respecting key signatures.
 */

// Key signature definitions: which pitches are altered
interface KeySignatureInfo {
  sharps?: number[]; // MIDI pitch classes that are sharped (0-11)
  flats?: number[]; // MIDI pitch classes that are flatted (0-11)
  preferFlats: boolean; // Whether to spell chromatic notes with flats
}

const KEY_SIGNATURES: Record<string, KeySignatureInfo> = {
  // Major keys with flats
  F: { flats: [10], preferFlats: true }, // Bb (pitch class 10)
  Bb: { flats: [10, 3], preferFlats: true }, // Bb, Eb
  Eb: { flats: [10, 3, 8], preferFlats: true }, // Bb, Eb, Ab
  Ab: { flats: [10, 3, 8, 1], preferFlats: true }, // Bb, Eb, Ab, Db
  Db: { flats: [10, 3, 8, 1, 6], preferFlats: true }, // Bb, Eb, Ab, Db, Gb
  Gb: { flats: [10, 3, 8, 1, 6, 11], preferFlats: true }, // Bb, Eb, Ab, Db, Gb, Cb (B is 11)
  Cb: { flats: [10, 3, 8, 1, 6, 11, 4], preferFlats: true }, // Bb, Eb, Ab, Db, Gb, Cb, Fb (E is 4)

  // Minor keys with flats
  Dm: { flats: [10], preferFlats: true }, // Bb
  Gm: { flats: [10, 3], preferFlats: true }, // Bb, Eb
  Cm: { flats: [10, 3, 8], preferFlats: true }, // Bb, Eb, Ab
  Fm: { flats: [10, 3, 8, 1], preferFlats: true }, // Bb, Eb, Ab, Db
  Bbm: { flats: [10, 3, 8, 1, 6], preferFlats: true }, // Bb, Eb, Ab, Db, Gb
  Ebm: { flats: [10, 3, 8, 1, 6, 11], preferFlats: true }, // Bb, Eb, Ab, Db, Gb, Cb
  Abm: { flats: [10, 3, 8, 1, 6, 11, 4], preferFlats: true }, // Bb, Eb, Ab, Db, Gb, Cb, Fb

  // Major keys with sharps
  G: { sharps: [6], preferFlats: false }, // F# (pitch class 6)
  D: { sharps: [6, 1], preferFlats: false }, // F#, C#
  A: { sharps: [6, 1, 8], preferFlats: false }, // F#, C#, G#
  E: { sharps: [6, 1, 8, 3], preferFlats: false }, // F#, C#, G#, D#
  B: { sharps: [6, 1, 8, 3, 10], preferFlats: false }, // F#, C#, G#, D#, A#
  'F#': { sharps: [6, 1, 8, 3, 10, 4], preferFlats: false }, // F#, C#, G#, D#, A#, E# (E is 4)
  'C#': { sharps: [6, 1, 8, 3, 10, 4, 11], preferFlats: false }, // F#, C#, G#, D#, A#, E#, B# (B is 11)

  // Minor keys with sharps
  Em: { sharps: [6], preferFlats: false }, // F#
  Bm: { sharps: [6, 1], preferFlats: false }, // F#, C#
  'F#m': { sharps: [6, 1, 8], preferFlats: false }, // F#, C#, G#
  'C#m': { sharps: [6, 1, 8, 3], preferFlats: false }, // F#, C#, G#, D#
  'G#m': { sharps: [6, 1, 8, 3, 10], preferFlats: false }, // F#, C#, G#, D#, A#
  'D#m': { sharps: [6, 1, 8, 3, 10, 4], preferFlats: false }, // F#, C#, G#, D#, A#, E#
  'A#m': { sharps: [6, 1, 8, 3, 10, 4, 11], preferFlats: false }, // F#, C#, G#, D#, A#, E#, B#

  // C major / A minor (no accidentals)
  C: { preferFlats: false },
  Am: { preferFlats: false }
};

/**
 * Convert MIDI note to VexFlow key notation, spelled correctly for the given key.
 * 
 * VexFlow key string rules:
 * - Notes IN the key signature use base letters only (e.g., F# in G major → "f/4")
 * - Notes NOT in the key signature include accidentals (e.g., F# in C major → "f#/4")
 * - In flat keys, chromatic notes use flat spelling (e.g., Db → "db/4", not "c#/4")
 * - In sharp keys, chromatic notes use sharp spelling (e.g., F# → "f#/4", not "gb/4")
 */
export function midiToVexKeyForKey(midiNote: number, key?: string): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const pitchClass = midiNote % 12;

  const keyInfo = key ? KEY_SIGNATURES[key] : undefined;
  const preferFlats = keyInfo?.preferFlats ?? false;

  // Check if this pitch class is in the key signature
  const isSharpedByKey = keyInfo?.sharps?.includes(pitchClass) ?? false;
  const isFlattedByKey = keyInfo?.flats?.includes(pitchClass) ?? false;

  // Map pitch class to VexFlow notation
  // For black keys, choose sharp or flat spelling based on key preference
  const noteMapping: Record<number, { sharp: string; flat: string; isBlack: boolean }> = {
    0: { sharp: 'c', flat: 'c', isBlack: false },         // C
    1: { sharp: 'c#', flat: 'db', isBlack: true },        // C#/Db
    2: { sharp: 'd', flat: 'd', isBlack: false },         // D
    3: { sharp: 'd#', flat: 'eb', isBlack: true },        // D#/Eb
    4: { sharp: 'e', flat: 'e', isBlack: false },         // E
    5: { sharp: 'f', flat: 'f', isBlack: false },         // F
    6: { sharp: 'f#', flat: 'gb', isBlack: true },        // F#/Gb
    7: { sharp: 'g', flat: 'g', isBlack: false },         // G
    8: { sharp: 'g#', flat: 'ab', isBlack: true },        // G#/Ab
    9: { sharp: 'a', flat: 'a', isBlack: false },         // A
    10: { sharp: 'a#', flat: 'bb', isBlack: true },       // A#/Bb
    11: { sharp: 'b', flat: 'b', isBlack: false }         // B
  };

  const mapping = noteMapping[pitchClass];

  // If this note is in the key signature, use base letter only
  if (isSharpedByKey || isFlattedByKey) {
    // Extract base letter (first character for all notes)
    const noteName = preferFlats ? mapping.flat : mapping.sharp;
    const baseLetter = noteName[0];  // First character is always the base letter
    return `${baseLetter}/${octave}`;
  }

  // Not in key signature - use full notation with # or b
  const noteName = preferFlats ? mapping.flat : mapping.sharp;
  return `${noteName}/${octave}`;
}

/**
 * State tracking for accidentals within a measure.
 */
export interface MeasureAccidentalState {
  // Maps base note letter ('c', 'd', 'e', 'f', 'g', 'a', 'b') to the
  // alteration currently in effect (null = natural, '#' = sharp, 'b' = flat)
  alterations: Map<string, string | null>;
}

/**
 * Create a new measure state with key signature accidentals pre-applied.
 */
export function createMeasureState(key?: string): MeasureAccidentalState {
  const state: MeasureAccidentalState = {
    alterations: new Map()
  };

  const keyInfo = key ? KEY_SIGNATURES[key] : undefined;

  // Map each sharped pitch class to its base letter
  if (keyInfo?.sharps) {
    const sharpLetterMap: Record<number, string> = {
      1: 'c',   // C#
      3: 'd',   // D#
      6: 'f',   // F#
      8: 'g',   // G#
      10: 'a',  // A#
      4: 'e',   // E# (rare)
      11: 'b'   // B# (rare)
    };
    for (const pitchClass of keyInfo.sharps) {
      const letter = sharpLetterMap[pitchClass];
      if (letter) {
        state.alterations.set(letter, '#');
      }
    }
  }

  // Map each flatted pitch class to its base letter
  if (keyInfo?.flats) {
    const flatLetterMap: Record<number, string> = {
      1: 'd',   // Db
      3: 'e',   // Eb
      6: 'g',   // Gb
      8: 'a',   // Ab
      10: 'b',  // Bb
      4: 'f',   // Fb (rare)
      11: 'c'   // Cb (rare)
    };
    for (const pitchClass of keyInfo.flats) {
      const letter = flatLetterMap[pitchClass];
      if (letter) {
        state.alterations.set(letter, 'b');
      }
    }
  }

  return state;
}

/**
 * Determine what accidental (if any) should be shown for a note.
 * Returns null if no accidental is needed, or '#', 'b', 'n' if one should be shown.
 * Also updates the measure state to reflect this note's accidental.
 * 
 * The logic:
 * - Check what alteration is currently in effect for this note's letter
 * - If the note matches the current alteration, no accidental needed
 * - If the note differs, show the appropriate accidental
 * - Update the measure state so future notes of the same letter remember this alteration
 */
export function accidentalForNote(
  midiNote: number,
  key: string | undefined,
  measureState: MeasureAccidentalState
): string | null {
  const pitchClass = midiNote % 12;
  const keyInfo = key ? KEY_SIGNATURES[key] : undefined;
  const preferFlats = keyInfo?.preferFlats ?? false;

  // Determine the base letter and alteration for this note
  const noteInfo: Record<number, { sharp: { letter: string; alteration: string | null }; flat: { letter: string; alteration: string | null } }> = {
    0: { sharp: { letter: 'c', alteration: null }, flat: { letter: 'c', alteration: null } },   // C
    1: { sharp: { letter: 'c', alteration: '#' }, flat: { letter: 'd', alteration: 'b' } },     // C#/Db
    2: { sharp: { letter: 'd', alteration: null }, flat: { letter: 'd', alteration: null } },   // D
    3: { sharp: { letter: 'd', alteration: '#' }, flat: { letter: 'e', alteration: 'b' } },     // D#/Eb
    4: { sharp: { letter: 'e', alteration: null }, flat: { letter: 'e', alteration: null } },   // E
    5: { sharp: { letter: 'f', alteration: null }, flat: { letter: 'f', alteration: null } },   // F
    6: { sharp: { letter: 'f', alteration: '#' }, flat: { letter: 'g', alteration: 'b' } },     // F#/Gb
    7: { sharp: { letter: 'g', alteration: null }, flat: { letter: 'g', alteration: null } },   // G
    8: { sharp: { letter: 'g', alteration: '#' }, flat: { letter: 'a', alteration: 'b' } },     // G#/Ab
    9: { sharp: { letter: 'a', alteration: null }, flat: { letter: 'a', alteration: null } },   // A
    10: { sharp: { letter: 'a', alteration: '#' }, flat: { letter: 'b', alteration: 'b' } },    // A#/Bb
    11: { sharp: { letter: 'b', alteration: null }, flat: { letter: 'b', alteration: null } }   // B
  };

  const spelling = preferFlats ? noteInfo[pitchClass].flat : noteInfo[pitchClass].sharp;
  const { letter, alteration } = spelling;

  // Get the current alteration state for this letter in the measure
  const currentAlteration = measureState.alterations.get(letter);

  let accidentalToShow: string | null = null;

  if (currentAlteration === undefined) {
    // First occurrence of this letter in the measure
    // Show accidental only if note has an alteration (not natural)
    if (alteration !== null) {
      accidentalToShow = alteration;
    }
  } else {
    // This letter has appeared before in this measure
    // Show accidental if this note's alteration differs from current state
    if (alteration !== currentAlteration) {
      accidentalToShow = alteration ?? 'n';  // Use 'n' for natural
    }
  }

  // Update measure state with this note's alteration
  measureState.alterations.set(letter, alteration);

  return accidentalToShow;
}
