import type { Note, Song } from '../../types';
import { isRest, midiToNoteName, midiToNoteNameEng } from '../../utils.ts';
import { keyAlterationForLetter, spellMidiPitch } from '../ui/accidentals.ts';

export type AccidentalChoice = 'none' | '#' | 'b' | 'n';
export type DurationValue = 1 | 2 | 4 | 8 | 16;

export const DURATION_VALUES: DurationValue[] = [1, 2, 4, 8, 16];

export const EDITOR_KEYS = ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Am', 'Em', 'Dm', 'Gm'] as const;

const LETTERS = ['c', 'd', 'e', 'f', 'g', 'a', 'b'] as const;
const NATURAL_PC = [0, 2, 4, 5, 7, 9, 11];

/** Diatonic step of C4. Each +1 is the next staff position (line/space). */
export const MIDDLE_C_STEP = 4 * 7;
const MIN_STEP = 2 * 7;
const MAX_STEP = 6 * 7 + 6;

export interface StaffEvent {
  rest: boolean;
  /** Absolute diatonic staff position. 0 = C0, MIDDLE_C_STEP = C4. */
  step: number;
  accidental: AccidentalChoice;
  duration: number;
  dotted: boolean;
  /** tie: true starts a tie; the next same pitch is the continuation. */
  tie: boolean;
  finger?: number;
  lyric?: string;
}

export interface EditorSnapshot {
  id: string;
  base: Song;
  title: string;
  titleKo: string;
  tempo: number;
  timeSignature: [number, number];
  key: string;
  /** 0 means no pickup. */
  pickupBeats: number;
  events: StaffEvent[];
  cursor: number;
}

export interface MeasureInfo<T> {
  items: T[];
  startIndex: number;
  beatCount: number;
  capacity: number;
  status: 'ok' | 'over' | 'under';
}

const EPS = 1e-6;

const DURATION_KO: Record<number, string> = {
  1: '온음표',
  2: '2분음표',
  4: '4분음표',
  8: '8분음표',
  16: '16분음표'
};

export function noteBeats(note: { duration: number; dotted?: boolean }, beatValue: number): number {
  return (beatValue / note.duration) * (note.dotted ? 1.5 : 1);
}

export function formatBeat(beat: number): string {
  const rounded = Math.round(beat * 1000) / 1000;
  if (Math.abs(rounded - Math.round(rounded)) < EPS) return String(Math.round(rounded));
  return String(rounded);
}

function statusOf(beatCount: number, capacity: number): 'ok' | 'over' | 'under' {
  if (beatCount > capacity + EPS) return 'over';
  if (beatCount < capacity - EPS) return 'under';
  return 'ok';
}

export function splitMeasures<T extends { duration: number; dotted?: boolean }>(
  items: T[],
  timeSignature: [number, number],
  pickupBeats?: number
): MeasureInfo<T>[] {
  const beatsPerMeasure = timeSignature[0];
  const beatValue = timeSignature[1];
  const measures: MeasureInfo<T>[] = [];
  let current: T[] = [];
  let currentBeats = 0;
  let index = 0;
  let measureIndex = 0;

  const capacityOf = (mi: number) =>
    mi === 0 && pickupBeats != null && pickupBeats > 0 ? pickupBeats : beatsPerMeasure;

  const push = () => {
    const capacity = capacityOf(measureIndex);
    measures.push({
      items: current,
      startIndex: index - current.length,
      beatCount: currentBeats,
      capacity,
      status: statusOf(currentBeats, capacity)
    });
    current = [];
    currentBeats = 0;
    measureIndex += 1;
  };

  for (const item of items) {
    const beats = noteBeats(item, beatValue);
    const capacity = capacityOf(measureIndex);
    if (currentBeats + beats > capacity + EPS && current.length > 0) {
      push();
    }
    current.push(item);
    currentBeats += beats;
    index += 1;
  }
  if (current.length > 0) push();
  return measures;
}

export function countMeasureProblems(measures: Array<{ status: 'ok' | 'over' | 'under' }>): {
  over: number;
  under: number;
} {
  return {
    over: measures.filter((m) => m.status === 'over').length,
    under: measures.filter((m) => m.status === 'under').length
  };
}

function letterIndex(letter: string): number {
  const idx = LETTERS.indexOf(letter as (typeof LETTERS)[number]);
  return idx < 0 ? 0 : idx;
}

export function stepFromSpelling(letter: string, octave: number): number {
  return octave * 7 + letterIndex(letter);
}

export function accidentalFromSpelling(
  alteration: '#' | 'b' | null,
  letter: string,
  key: string
): AccidentalChoice {
  const keyAlt = keyAlterationForLetter(letter, key);
  if (alteration === keyAlt) return 'none';
  if (alteration == null) return 'n';
  return alteration;
}

export function eventToMidi(event: Pick<StaffEvent, 'step' | 'accidental'>, key: string): number {
  const octave = Math.floor(event.step / 7);
  const index = ((event.step % 7) + 7) % 7;
  const letter = LETTERS[index];
  let semis = 0;
  if (event.accidental === '#') semis = 1;
  else if (event.accidental === 'b') semis = -1;
  else if (event.accidental === 'n') semis = 0;
  else {
    const keyAlt = keyAlterationForLetter(letter, key);
    semis = keyAlt === '#' ? 1 : keyAlt === 'b' ? -1 : 0;
  }
  return (octave + 1) * 12 + NATURAL_PC[index] + semis;
}

export function shiftDiatonic(step: number, delta: number): number {
  return Math.max(MIN_STEP, Math.min(MAX_STEP, step + delta));
}

export function notesToEvents(notes: Note[], key: string): StaffEvent[] {
  return notes.map((note) => {
    const dotted = note.dotted === true;
    if (isRest(note) || note.pitch == null) {
      return {
        rest: true,
        step: MIDDLE_C_STEP,
        accidental: 'none' as const,
        duration: note.duration,
        dotted,
        tie: false,
        finger: note.finger,
        lyric: note.lyric
      };
    }
    const spelled = spellMidiPitch(note.pitch, key);
    return {
      rest: false,
      step: stepFromSpelling(spelled.letter, spelled.octave),
      accidental: accidentalFromSpelling(spelled.alteration, spelled.letter, key),
      duration: note.duration,
      dotted,
      tie: note.tie === true,
      finger: note.finger,
      lyric: note.lyric
    };
  });
}

export function eventsToNotes(events: StaffEvent[], key: string): Note[] {
  return events.map((event) => {
    const note: Note = { duration: event.duration };
    if (event.dotted) note.dotted = true;
    if (event.lyric) note.lyric = event.lyric;
    if (event.rest) {
      note.rest = true;
      if (event.finger != null) note.finger = event.finger;
      return note;
    }
    note.pitch = eventToMidi(event, key);
    if (event.tie) note.tie = true;
    if (event.finger != null) note.finger = event.finger;
    return note;
  });
}

export function respellForKey(events: StaffEvent[], fromKey: string, toKey: string): StaffEvent[] {
  const next = notesToEvents(eventsToNotes(events, fromKey), toKey);
  return next.map((event, index) => {
    const previous = events[index];
    if (!previous?.rest) return event;
    return { ...event, step: previous.step, accidental: previous.accidental };
  });
}

export function durationLabel(event: Pick<StaffEvent, 'duration' | 'dotted' | 'rest'>): string {
  const base = DURATION_KO[event.duration] ?? `${event.duration}분음표`;
  const dotted = event.dotted ? '점' : '';
  const kind = event.rest ? base.replace('음표', '쉼표') : base;
  return `${dotted}${kind}`;
}

export interface CursorInfo {
  measureNumber: number;
  measureCount: number;
  beatLabel: string;
  beatCount: number;
  capacity: number;
  status: 'ok' | 'over' | 'under' | 'empty';
  pitchLabel: string;
  durationLabel: string;
  dotted: boolean;
}

export function describeCursor(
  events: StaffEvent[],
  index: number,
  timeSignature: [number, number],
  pickupBeats: number | undefined,
  key: string
): CursorInfo {
  const measures = splitMeasures(events, timeSignature, pickupBeats);
  const empty: CursorInfo = {
    measureNumber: 0,
    measureCount: measures.length,
    beatLabel: '-',
    beatCount: 0,
    capacity: timeSignature[0],
    status: 'empty',
    pitchLabel: '-',
    durationLabel: '-',
    dotted: false
  };
  if (events.length === 0 || index < 0 || index >= events.length) return empty;

  const measure = measures.find(
    (m) => index >= m.startIndex && index < m.startIndex + m.items.length
  );
  const event = events[index];
  let beat = 1;
  if (measure) {
    let before = 0;
    for (let i = measure.startIndex; i < index; i++) {
      before += noteBeats(events[i], timeSignature[1]);
    }
    beat = 1 + before;
  }
  const pitchLabel = event.rest
    ? '쉼표'
    : `${midiToNoteName(eventToMidi(event, key))} (${midiToNoteNameEng(eventToMidi(event, key))})`;

  return {
    measureNumber: measure ? measures.indexOf(measure) + 1 : 0,
    measureCount: measures.length,
    beatLabel: formatBeat(beat),
    beatCount: measure?.beatCount ?? 0,
    capacity: measure?.capacity ?? timeSignature[0],
    status: measure?.status ?? 'empty',
    pitchLabel,
    durationLabel: durationLabel(event),
    dotted: event.dotted
  };
}

export function makeEvent(
  tool: { duration: number; dotted: boolean; rest: boolean },
  step: number
): StaffEvent {
  return {
    rest: tool.rest,
    step,
    accidental: 'none',
    duration: tool.duration,
    dotted: tool.dotted,
    tie: false
  };
}

export function insertEvent(events: StaffEvent[], index: number, event: StaffEvent): StaffEvent[] {
  const at = Math.max(0, Math.min(index, events.length));
  return [...events.slice(0, at), event, ...events.slice(at)];
}

export function removeEvent(events: StaffEvent[], index: number): { events: StaffEvent[]; cursor: number } {
  if (index < 0 || index >= events.length) return { events, cursor: index };
  const next = events.filter((_, i) => i !== index);
  return { events: next, cursor: next.length === 0 ? -1 : Math.min(index, next.length - 1) };
}

export function songToSnapshot(song: Song): EditorSnapshot {
  const cursor = song.notes.length > 0 ? 0 : -1;
  return {
    id: song.id,
    base: song,
    title: song.title,
    titleKo: song.titleKo,
    tempo: song.tempo,
    timeSignature: [song.timeSignature[0], song.timeSignature[1]],
    key: song.key,
    pickupBeats: song.pickupBeats ?? 0,
    events: notesToEvents(song.notes, song.key),
    cursor
  };
}

export function snapshotToSong(snapshot: EditorSnapshot): Song {
  const song: Song = {
    ...snapshot.base,
    id: snapshot.id,
    title: snapshot.title.trim() || snapshot.base.title,
    titleKo: snapshot.titleKo.trim() || snapshot.base.titleKo,
    tempo: snapshot.tempo,
    timeSignature: [snapshot.timeSignature[0], snapshot.timeSignature[1]],
    key: snapshot.key,
    notes: eventsToNotes(snapshot.events, snapshot.key)
  };
  if (snapshot.pickupBeats > 0) song.pickupBeats = snapshot.pickupBeats;
  else delete song.pickupBeats;
  return song;
}

/** Admin editor stores every song at this tempo. */
export const EDITOR_SAVE_TEMPO = 100;

export function songReadyToSave(snapshot: EditorSnapshot): Song {
  const song = snapshotToSong(snapshot);
  song.tempo = EDITOR_SAVE_TEMPO;
  return song;
}

export function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    ...snapshot,
    base: snapshot.base,
    timeSignature: [snapshot.timeSignature[0], snapshot.timeSignature[1]],
    events: snapshot.events.map((event) => ({ ...event }))
  };
}

export function blankSong(): Song {
  return {
    id: `custom-${Date.now()}`,
    title: 'New Melody',
    titleKo: '새 멜로디',
    origin: 'korean',
    composer: 'Custom',
    difficulty: 'beginner',
    tempo: EDITOR_SAVE_TEMPO,
    timeSignature: [4, 4],
    key: 'C',
    notes: [
      { pitch: 60, duration: 4 },
      { pitch: 62, duration: 4 },
      { pitch: 64, duration: 4 },
      { pitch: 65, duration: 4 }
    ],
    tags: ['custom'],
    description: '브라우저에서 만든 멜로디'
  };
}

export function stepNear(events: StaffEvent[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (!events[i].rest) return events[i].step;
  }
  for (let i = index + 1; i < events.length; i++) {
    if (!events[i].rest) return events[i].step;
  }
  return MIDDLE_C_STEP;
}
