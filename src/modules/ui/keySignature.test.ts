import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stavePreludeWidth, vexKeySignature } from './keySignature.ts';

test('F major uses the F key signature', () => {
  assert.equal(vexKeySignature('F'), 'F');
});

test('C major has no key signature to draw', () => {
  assert.equal(vexKeySignature('C'), null);
});

test('unknown keys are omitted instead of crashing', () => {
  assert.equal(vexKeySignature(''), null);
  assert.equal(vexKeySignature('Nope'), null);
});

test('later measures still reserve room for clef and F key signature', () => {
  const later = stavePreludeWidth({ key: 'F', isFirstMeasure: false });
  const first = stavePreludeWidth({ key: 'F', isFirstMeasure: true });
  const laterC = stavePreludeWidth({ key: 'C', isFirstMeasure: false });

  assert.ok(later > laterC, 'F later bars need extra space for the flat');
  assert.ok(first > later, 'first bar also needs time signature space');
});
