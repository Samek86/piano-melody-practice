import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const song = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'akatonbo.json'), 'utf8')
) as {
  timeSignature: [number, number];
  notes: Array<{ duration: number; dotted?: boolean; rest?: boolean }>;
};

function noteBeats(note: { duration: number; dotted?: boolean }, beatValue: number): number {
  return (beatValue / note.duration) * (note.dotted ? 1.5 : 1);
}

function measureBeats(): number[] {
  const [beatsPerMeasure, beatValue] = song.timeSignature;
  const measures: number[] = [];
  let current = 0;
  for (const note of song.notes) {
    const beats = noteBeats(note, beatValue);
    if (current + beats > beatsPerMeasure + 1e-9 && current > 0) {
      measures.push(current);
      current = 0;
    }
    current += beats;
  }
  if (current > 0) measures.push(current);
  return measures;
}

test('akatonbo is in 3/4 and every bar sums to 3 beats', () => {
  assert.deepEqual(song.timeSignature, [3, 4]);
  const measures = measureBeats();
  assert.equal(measures.length, 8);
  for (const beats of measures) {
    assert.ok(Math.abs(beats - 3) < 1e-9, `expected 3 beats, got ${beats}`);
  }
});

test('akatonbo uses dotted quarters and quarter rests, not duration: 3', () => {
  assert.ok(song.notes.some((n) => n.dotted === true && n.duration === 4));
  assert.ok(song.notes.some((n) => n.rest === true && n.duration === 4));
  assert.equal(song.notes.some((n) => n.duration === 3), false);
});
