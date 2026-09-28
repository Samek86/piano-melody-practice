import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Note, Song } from '../../types.ts';
import {
  MIDDLE_C_STEP,
  blankSong,
  countMeasureProblems,
  describeCursor,
  eventToMidi,
  eventsToNotes,
  insertEvent,
  makeEvent,
  EDITOR_SAVE_TEMPO,
  noteBeats,
  notesToEvents,
  removeEvent,
  songReadyToSave,
  respellForKey,
  shiftDiatonic,
  snapshotToSong,
  songToSnapshot,
  splitMeasures,
  stepFromSpelling
} from './staffModel.ts';

const songsDir = join(dirname(fileURLToPath(import.meta.url)), '../../data/songs');

function collectJson(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectJson(path));
    else if (entry.name.endsWith('.json')) out.push(path);
  }
  return out;
}

function loadSong(path: string): Song {
  return JSON.parse(readFileSync(path, 'utf8')) as Song;
}

test('every bundled song round-trips through the editor model', () => {
  const files = collectJson(songsDir);
  assert.ok(files.length >= 20);
  for (const file of files) {
    const song = loadSong(file);
    const again = snapshotToSong(songToSnapshot(song));
    assert.deepEqual(again.notes, song.notes, file);
    assert.equal(again.key, song.key, file);
    assert.deepEqual(again.timeSignature, song.timeSignature, file);
    assert.equal(again.pickupBeats, song.pickupBeats, file);
    assert.equal(again.titleKo, song.titleKo, file);
  }
});

test('C4 sharp is C# and a diatonic step up from C is D', () => {
  const c4 = { step: MIDDLE_C_STEP, accidental: 'none' as const };
  assert.equal(eventToMidi(c4, 'C'), 60);
  assert.equal(eventToMidi({ ...c4, accidental: '#' }, 'C'), 61);
  assert.equal(eventToMidi({ ...c4, accidental: 'b' }, 'C'), 59);
  assert.equal(eventToMidi({ step: shiftDiatonic(MIDDLE_C_STEP, 1), accidental: 'none' }, 'C'), 62);
  assert.equal(eventToMidi({ step: stepFromSpelling('e', 4), accidental: '#' }, 'C'), 65);
});

test('G major F# is in the key, F natural is an explicit natural', () => {
  const fSharp = notesToEvents([{ pitch: 66, duration: 4 }], 'G')[0];
  assert.equal(fSharp.accidental, 'none');
  assert.equal(eventToMidi(fSharp, 'G'), 66);

  const fNatural = notesToEvents([{ pitch: 65, duration: 4 }], 'G')[0];
  assert.equal(fNatural.accidental, 'n');
  assert.equal(eventToMidi(fNatural, 'G'), 65);
});

test('F major Bb is in the key and stays Bb after save', () => {
  const events = notesToEvents([{ pitch: 70, duration: 4, finger: 2 }], 'F');
  assert.equal(events[0].accidental, 'none');
  const notes = eventsToNotes(events, 'F');
  assert.deepEqual(notes, [{ pitch: 70, duration: 4, finger: 2 }]);
});

test('key change keeps a rest staff position and the sounding pitches', () => {
  const events = notesToEvents([{ rest: true, duration: 4 }, { pitch: 67, duration: 4 }], 'C');
  events[0] = { ...events[0], step: MIDDLE_C_STEP + 2 };
  const next = respellForKey(events, 'C', 'G');
  assert.equal(next[0].rest, true);
  assert.equal(next[0].step, MIDDLE_C_STEP + 2);
  assert.equal(eventsToNotes(next, 'G')[1].pitch, 67);
});

test('changing key respells without changing MIDI pitches', () => {
  const events = notesToEvents(
    [
      { pitch: 65, duration: 4 },
      { pitch: 66, duration: 4 }
    ],
    'C'
  );
  const inG = respellForKey(events, 'C', 'G');
  assert.deepEqual(
    eventsToNotes(inG, 'G').map((note) => note.pitch),
    [65, 66]
  );
  assert.equal(inG[1].accidental, 'none');
  assert.equal(inG[0].accidental, 'n');
});

test('ties and rests survive conversion', () => {
  const notes: Note[] = [
    { pitch: 64, duration: 2, tie: true },
    { pitch: 64, duration: 2 },
    { rest: true, duration: 4, dotted: true }
  ];
  assert.deepEqual(eventsToNotes(notesToEvents(notes, 'C'), 'C'), notes);
});

test('saving forces tempo 100 and keeps or clears finger numbers', () => {
  const song = blankSong();
  song.tempo = 72;
  song.notes = [{ pitch: 60, duration: 4, finger: 3 }];
  const saved = songReadyToSave(songToSnapshot(song));
  assert.equal(saved.tempo, EDITOR_SAVE_TEMPO);
  assert.equal(saved.notes[0].finger, 3);

  const cleared = songToSnapshot(saved);
  delete cleared.events[0].finger;
  assert.equal(songReadyToSave(cleared).notes[0].finger, undefined);
  assert.equal(blankSong().tempo, 100);
});

test('4/4 quarter notes fill a measure and a leftover eighth underfills', () => {
  const quarters = [0, 1, 2, 3].map(() => ({ duration: 4 }));
  const full = splitMeasures(quarters, [4, 4]);
  assert.equal(full.length, 1);
  assert.equal(full[0].status, 'ok');
  assert.equal(full[0].beatCount, 4);

  const short = splitMeasures([{ duration: 8 }, { duration: 4 }], [4, 4]);
  assert.equal(short.length, 1);
  assert.equal(short[0].status, 'under');
  assert.equal(noteBeats({ duration: 4, dotted: true }, 4), 1.5);
});

test('a whole note overflows 3/4 and a pickup bar uses pickup capacity', () => {
  const over = splitMeasures([{ duration: 1 }], [3, 4]);
  assert.equal(over[0].status, 'over');
  assert.equal(over[0].capacity, 3);

  const pickup = splitMeasures(
    [{ duration: 8 }, { duration: 8 }, { duration: 4 }, { duration: 4 }, { duration: 4 }],
    [3, 4],
    1
  );
  assert.equal(pickup[0].capacity, 1);
  assert.equal(pickup[0].status, 'ok');
  assert.equal(pickup[1].capacity, 3);
  assert.equal(pickup[1].status, 'ok');
  assert.equal(countMeasureProblems(pickup).under, 0);
});

test('happy birthday pickup measure is one beat and later bars are full', () => {
  const song = loadSong(join(songsDir, 'beginner/happy-birthday.json'));
  const measures = splitMeasures(song.notes, song.timeSignature, song.pickupBeats);
  assert.equal(measures[0].beatCount, 1);
  assert.equal(measures[0].status, 'ok');
  for (const measure of measures.slice(1)) {
    assert.equal(measure.status, 'ok', `bar starting at ${measure.startIndex}`);
    assert.equal(measure.beatCount, 3);
  }
});

test('akatonbo bars each sum to 3 beats', () => {
  const song = loadSong(join(songsDir, 'beginner/akatonbo.json'));
  const measures = splitMeasures(song.notes, song.timeSignature, song.pickupBeats);
  assert.equal(measures.length, 8);
  for (const measure of measures) {
    assert.equal(measure.status, 'ok');
    assert.equal(measure.beatCount, 3);
  }
});

test('cursor info reports measure, beat, and underfill', () => {
  const events = notesToEvents(
    [
      { pitch: 60, duration: 4 },
      { pitch: 62, duration: 4 }
    ],
    'C'
  );
  const info = describeCursor(events, 1, [4, 4], undefined, 'C');
  assert.equal(info.measureNumber, 1);
  assert.equal(info.beatLabel, '2');
  assert.equal(info.status, 'under');
  assert.match(info.pitchLabel, /레/);
  assert.equal(info.durationLabel, '4분음표');
});

test('insert and delete keep the surrounding notes', () => {
  const events = notesToEvents([{ pitch: 60, duration: 4 }], 'C');
  const inserted = insertEvent(events, 1, makeEvent({ duration: 8, dotted: false, rest: true }, MIDDLE_C_STEP));
  assert.equal(inserted.length, 2);
  assert.equal(inserted[1].rest, true);
  assert.equal(inserted[1].duration, 8);
  const removed = removeEvent(inserted, 0);
  assert.equal(removed.events.length, 1);
  assert.equal(removed.events[0].rest, true);
  assert.equal(removed.cursor, 0);
});
