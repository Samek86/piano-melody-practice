import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StaveNote } from 'vexflow';
import { latchDetectedFrequency, isRest, vexDuration, firstPlayableNoteIndex } from './utils.ts';
import type { Note } from './types.ts';

test('keeps last detected pitch when microphone goes silent', () => {
  const afterNote = latchDetectedFrequency(null, 440);
  const afterSilence = latchDetectedFrequency(afterNote, null);

  assert.equal(afterSilence, 440);
});

test('updates displayed pitch when a new note is recognized', () => {
  const afterFirst = latchDetectedFrequency(null, 440);
  const afterSilence = latchDetectedFrequency(afterFirst, null);
  const afterSecond = latchDetectedFrequency(afterSilence, 523.25);

  assert.equal(afterSecond, 523.25);
});

test('ignores invalid frequencies and keeps the last valid pitch', () => {
  let pitch = latchDetectedFrequency(null, 261.63);
  pitch = latchDetectedFrequency(pitch, 0);
  pitch = latchDetectedFrequency(pitch, Number.NaN);
  pitch = latchDetectedFrequency(pitch, -12);

  assert.equal(pitch, 261.63);
});

test('treats rest:true as a rest even without pitch', () => {
  const note: Note = { rest: true, duration: 4 };
  assert.equal(isRest(note), true);
});

test('does not treat a pitched note as a rest', () => {
  const note: Note = { pitch: 60, duration: 4 };
  assert.equal(isRest(note), false);
});

test('maps rest durations to VexFlow rest codes', () => {
  assert.equal(vexDuration({ rest: true, duration: 1 }), 'wr');
  assert.equal(vexDuration({ rest: true, duration: 2 }), 'hr');
  assert.equal(vexDuration({ rest: true, duration: 4 }), 'qr');
  assert.equal(vexDuration({ rest: true, duration: 8 }), '8r');
  assert.equal(vexDuration({ rest: true, duration: 16 }), '16r');
});

test('maps a dotted quarter rest to VexFlow qdr', () => {
  assert.equal(vexDuration({ rest: true, duration: 4, dotted: true }), 'qdr');
});

test('VexFlow treats rest:true duration codes as rests', () => {
  const note = new StaveNote({
    keys: ['b/4'],
    duration: vexDuration({ rest: true, duration: 4 })
  });
  assert.equal(note.isRest(), true);
});

test('maps pitched notes to VexFlow note durations without a rest suffix', () => {
  assert.equal(vexDuration({ pitch: 60, duration: 4 }), 'q');
  assert.equal(vexDuration({ pitch: 60, duration: 2, dotted: true }), 'hd');
});

test('skips rests to the next pitched note', () => {
  const notes: Note[] = [
    { rest: true, duration: 4 },
    { rest: true, duration: 4 },
    { pitch: 60, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 0), 2);
  assert.equal(firstPlayableNoteIndex(notes, 2), 2);
});

test('returns -1 when only rests remain', () => {
  const notes: Note[] = [{ rest: true, duration: 4 }, { rest: true, duration: 2 }];
  assert.equal(firstPlayableNoteIndex(notes, 0), -1);
  assert.equal(firstPlayableNoteIndex(notes, 1), -1);
});

test('skips tied continuation notes (tie: true)', () => {
  const notes: Note[] = [
    { pitch: 69, duration: 4 },
    { pitch: 69, duration: 4, tie: true },
    { pitch: 67, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 0), 0);
  assert.equal(firstPlayableNoteIndex(notes, 1), 2);
  assert.equal(firstPlayableNoteIndex(notes, 2), 2);
});

test('skips both rests and tied continuations', () => {
  const notes: Note[] = [
    { pitch: 60, duration: 4 },
    { rest: true, duration: 4 },
    { pitch: 65, duration: 4, tie: true },
    { pitch: 67, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 1), 3);
});

test('handles tie at measure boundary (typical bug scenario)', () => {
  const notes: Note[] = [
    { pitch: 60, duration: 4 },
    { pitch: 62, duration: 4 },
    { pitch: 64, duration: 4 },
    { pitch: 69, duration: 4 },
    { pitch: 69, duration: 4, tie: true },
    { pitch: 67, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 4), 5);
});

test('returns -1 when only tied continuations remain', () => {
  const notes: Note[] = [
    { pitch: 60, duration: 4 },
    { pitch: 60, duration: 2, tie: true }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 1), -1);
});
