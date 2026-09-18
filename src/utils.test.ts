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

test('skips tied continuation notes', () => {
  const notes: Note[] = [
    { pitch: 60, duration: 2, tie: true }, // Start of tie
    { pitch: 60, duration: 2 },            // Tied continuation (same pitch)
    { pitch: 62, duration: 4 }             // Next playable note
  ];
  // From index 0, first playable is 0 (the tie start)
  assert.equal(firstPlayableNoteIndex(notes, 0), 0);
  // From index 1, skip the tied continuation, next playable is 2
  assert.equal(firstPlayableNoteIndex(notes, 1), 2);
  // From index 2, first playable is 2
  assert.equal(firstPlayableNoteIndex(notes, 2), 2);
});

test('does not skip a note after a tie if pitch changes', () => {
  const notes: Note[] = [
    { pitch: 60, duration: 2, tie: true }, // Tie on C
    { pitch: 62, duration: 2 }             // Different pitch (D), not a continuation
  ];
  // The second note is playable because pitch changed
  assert.equal(firstPlayableNoteIndex(notes, 1), 1);
});

test('skips multiple tied continuations in a chain', () => {
  const notes: Note[] = [
    { pitch: 60, duration: 4, tie: true },  // Start of tie
    { pitch: 60, duration: 4, tie: true },  // Continuation, also tied
    { pitch: 60, duration: 4 },             // Final continuation
    { pitch: 62, duration: 4 }              // Next playable
  ];
  // From index 1, skip all tied continuations
  assert.equal(firstPlayableNoteIndex(notes, 1), 3);
  // From index 2, skip this continuation too
  assert.equal(firstPlayableNoteIndex(notes, 2), 3);
});

test('skips both rests and tied continuations', () => {
  const notes: Note[] = [
    { rest: true, duration: 4 },            // Rest
    { pitch: 60, duration: 2, tie: true },  // Playable tie start
    { pitch: 60, duration: 2 },             // Tied continuation
    { rest: true, duration: 4 },            // Another rest
    { pitch: 62, duration: 4 }              // Next playable
  ];
  // From index 0, skip rest to get to tie start at index 1
  assert.equal(firstPlayableNoteIndex(notes, 0), 1);
  // From index 2, skip tied continuation and rest to get to index 4
  assert.equal(firstPlayableNoteIndex(notes, 2), 4);
});

test('returns -1 when only rests remain', () => {
  const notes: Note[] = [{ rest: true, duration: 4 }, { rest: true, duration: 2 }];
  assert.equal(firstPlayableNoteIndex(notes, 0), -1);
  assert.equal(firstPlayableNoteIndex(notes, 1), -1);
});

test('skips tied continuation notes with same pitch', () => {
  const notes: Note[] = [
    { pitch: 69, duration: 8, tie: true },
    { pitch: 69, duration: 8 }, // tied continuation
    { pitch: 72, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 0), 0); // First note is playable
  assert.equal(firstPlayableNoteIndex(notes, 1), 2); // Skip tied continuation, go to next
});

test('does not skip note with tie flag but different pitch', () => {
  const notes: Note[] = [
    { pitch: 69, duration: 8, tie: true },
    { pitch: 72, duration: 8 }, // different pitch, not a continuation
    { pitch: 67, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 1), 1); // Should not skip
});

test('skips multiple tied continuation notes', () => {
  const notes: Note[] = [
    { pitch: 69, duration: 8, tie: true },
    { pitch: 69, duration: 8, tie: true }, // tied continuation with tie
    { pitch: 69, duration: 4 }, // second tied continuation
    { pitch: 67, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 1), 3); // Skip both continuations
});

test('skips rests and tied continuations together', () => {
  const notes: Note[] = [
    { pitch: 69, duration: 8, tie: true },
    { pitch: 69, duration: 8 }, // tied continuation
    { rest: true, duration: 4 },
    { pitch: 72, duration: 4 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 1), 3); // Skip tied continuation and rest
});

test('tie flag without continuation note does not affect next different pitch', () => {
  const notes: Note[] = [
    { pitch: 69, duration: 8, tie: true },
    { pitch: 72, duration: 8 }
  ];
  assert.equal(firstPlayableNoteIndex(notes, 1), 1); // Next note is different pitch, should play
});
