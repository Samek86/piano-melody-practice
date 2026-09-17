import { test } from 'node:test';
import assert from 'node:assert/strict';
import { midiToVexKeyForKey, createMeasureState, accidentalForNote } from './accidentals.ts';

// MIDI note reference:
// C4 = 60, C#4 = 61, D4 = 62, D#4 = 63, E4 = 64, F4 = 65, F#4 = 66
// G4 = 67, G#4 = 68, A4 = 69, A#4 = 70, B4 = 71, C5 = 72

test('C major: F# (MIDI 66) spelled as f#', () => {
  const vexKey = midiToVexKeyForKey(66, 'C');
  assert.equal(vexKey, 'f#/4');
});

test('C major: F# (MIDI 66) needs # accidental', () => {
  const state = createMeasureState('C');
  const accidental = accidentalForNote(66, 'C', state);
  assert.equal(accidental, '#');
});

test('G major: F# (MIDI 66) spelled as f and needs no accidental', () => {
  const vexKey = midiToVexKeyForKey(66, 'G');
  assert.equal(vexKey, 'f/4');

  const state = createMeasureState('G');
  const accidental = accidentalForNote(66, 'G', state);
  assert.equal(accidental, null, 'F# is in G major key signature, no accidental needed');
});

test('G major: F natural (MIDI 65) needs natural sign', () => {
  const vexKey = midiToVexKeyForKey(65, 'G');
  assert.equal(vexKey, 'f/4');

  const state = createMeasureState('G');
  const accidental = accidentalForNote(65, 'G', state);
  assert.equal(accidental, 'n', 'F natural needs natural sign to cancel key signature F#');
});

test('F major: Bb (MIDI 70) spelled as bb with flat notation', () => {
  const vexKey = midiToVexKeyForKey(70, 'F');
  assert.equal(vexKey, 'b/4', 'MIDI 70 in F major should be spelled as b (Bb note)');
});

test('F major: Bb (MIDI 70) needs no accidental', () => {
  const state = createMeasureState('F');
  const accidental = accidentalForNote(70, 'F', state);
  assert.equal(accidental, null, 'Bb is in F major key signature');
});

test('F major: B natural (MIDI 71) needs natural sign', () => {
  const vexKey = midiToVexKeyForKey(71, 'F');
  assert.equal(vexKey, 'b/4');

  const state = createMeasureState('F');
  const accidental = accidentalForNote(71, 'F', state);
  assert.equal(accidental, 'n', 'B natural needs natural sign to cancel key signature Bb');
});

test('D major: F# and C# in key signature need no accidentals', () => {
  const state = createMeasureState('D');

  // F# (MIDI 66)
  const f_sharp = midiToVexKeyForKey(66, 'D');
  assert.equal(f_sharp, 'f/4');
  const accF = accidentalForNote(66, 'D', state);
  assert.equal(accF, null);

  // C# (MIDI 61)
  const c_sharp = midiToVexKeyForKey(61, 'D');
  assert.equal(c_sharp, 'c/4');
  const accC = accidentalForNote(61, 'D', state);
  assert.equal(accC, null);
});

test('Bb major: Bb and Eb in key signature need no accidentals', () => {
  const state = createMeasureState('Bb');

  // Bb (MIDI 70)
  const b_flat = midiToVexKeyForKey(70, 'Bb');
  assert.equal(b_flat, 'b/4');
  const accBb = accidentalForNote(70, 'Bb', state);
  assert.equal(accBb, null);

  // Eb (MIDI 63)
  const e_flat = midiToVexKeyForKey(63, 'Bb');
  assert.equal(e_flat, 'e/4');
  const accEb = accidentalForNote(63, 'Bb', state);
  assert.equal(accEb, null);
});

test('Measure state: repeated G# within measure needs accidental only once', () => {
  const state = createMeasureState('C');

  // First G# (MIDI 68)
  const acc1 = accidentalForNote(68, 'C', state);
  assert.equal(acc1, '#', 'First G# needs sharp');

  // Second G# in same measure
  const acc2 = accidentalForNote(68, 'C', state);
  assert.equal(acc2, null, 'Second G# does not need another sharp');
});

test('Measure state: G# then G natural needs natural sign', () => {
  const state = createMeasureState('C');

  // First G# (MIDI 68)
  const acc1 = accidentalForNote(68, 'C', state);
  assert.equal(acc1, '#');

  // Then G natural (MIDI 67)
  const acc2 = accidentalForNote(67, 'C', state);
  assert.equal(acc2, 'n', 'G natural after G# needs natural sign');
});

test('Measure state: F# then F natural in G major', () => {
  const state = createMeasureState('G');

  // F# (MIDI 66) - in key signature
  const acc1 = accidentalForNote(66, 'G', state);
  assert.equal(acc1, null, 'F# is in key signature');

  // F natural (MIDI 65)
  const acc2 = accidentalForNote(65, 'G', state);
  assert.equal(acc2, 'n', 'F natural needs natural sign');

  // F# again
  const acc3 = accidentalForNote(66, 'G', state);
  assert.equal(acc3, '#', 'F# after F natural needs sharp again');
});

test('Flat keys spell chromatic notes with flats', () => {
  // F major (1 flat) - C# should be spelled as Db
  const db_in_f = midiToVexKeyForKey(61, 'F');
  assert.equal(db_in_f, 'db/4', 'C#/Db in F major spelled as db (includes flat notation)');

  // Bb major (2 flats) - G# should be spelled as Ab
  const ab_in_bb = midiToVexKeyForKey(68, 'Bb');
  assert.equal(ab_in_bb, 'ab/4', 'G#/Ab in Bb major spelled as ab (includes flat notation)');
});

test('Sharp keys spell chromatic notes with sharps', () => {
  // G major (1 sharp) - Bb should be spelled as A#
  const as_in_g = midiToVexKeyForKey(70, 'G');
  assert.equal(as_in_g, 'a#/4', 'A#/Bb in G major spelled as a#');

  // D major (2 sharps) - Eb should be spelled as D#
  const ds_in_d = midiToVexKeyForKey(63, 'D');
  assert.equal(ds_in_d, 'd#/4', 'D#/Eb in D major spelled as d#');
});

test('No key signature defaults to sharps', () => {
  const gs = midiToVexKeyForKey(68);
  assert.equal(gs, 'g#/4', 'Without key, black keys use sharp spelling');

  const cs = midiToVexKeyForKey(61);
  assert.equal(cs, 'c#/4');
});

test('Octaves are correctly calculated', () => {
  // Middle C (C4)
  const c4 = midiToVexKeyForKey(60, 'C');
  assert.equal(c4, 'c/4');

  // C5
  const c5 = midiToVexKeyForKey(72, 'C');
  assert.equal(c5, 'c/5');

  // C3
  const c3 = midiToVexKeyForKey(48, 'C');
  assert.equal(c3, 'c/3');
});

test('Minor keys: A minor (no accidentals)', () => {
  const state = createMeasureState('Am');

  // F natural
  const f = midiToVexKeyForKey(65, 'Am');
  assert.equal(f, 'f/4');
  const accF = accidentalForNote(65, 'Am', state);
  assert.equal(accF, null);

  // F# needs sharp
  const fs = midiToVexKeyForKey(66, 'Am');
  assert.equal(fs, 'f#/4');
  const accFs = accidentalForNote(66, 'Am', state);
  assert.equal(accFs, '#');
});

test('Minor keys: D minor (1 flat)', () => {
  const state = createMeasureState('Dm');

  // Bb in key signature
  const bb = midiToVexKeyForKey(70, 'Dm');
  assert.equal(bb, 'b/4');
  const accBb = accidentalForNote(70, 'Dm', state);
  assert.equal(accBb, null);

  // B natural needs natural sign
  const b = midiToVexKeyForKey(71, 'Dm');
  assert.equal(b, 'b/4');
  const accB = accidentalForNote(71, 'Dm', state);
  assert.equal(accB, 'n');
});

test('Minor keys: E minor (1 sharp)', () => {
  const state = createMeasureState('Em');

  // F# in key signature
  const fs = midiToVexKeyForKey(66, 'Em');
  assert.equal(fs, 'f/4');
  const accFs = accidentalForNote(66, 'Em', state);
  assert.equal(accFs, null);

  // F natural needs natural sign
  const f = midiToVexKeyForKey(65, 'Em');
  assert.equal(f, 'f/4');
  const accF = accidentalForNote(65, 'Em', state);
  assert.equal(accF, 'n');
});
