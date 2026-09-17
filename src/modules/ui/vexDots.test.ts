import './vexflow-dom-stub.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StaveNote } from 'vexflow';
import { attachDots } from './vexDots.ts';
import { vexDuration } from '../../utils.ts';

test('a dotted duration string does not draw a visual dot by itself', () => {
  const note = new StaveNote({
    keys: ['f/4'],
    duration: vexDuration({ duration: 4, dotted: true, pitch: 65 }),
    clef: 'treble'
  });
  assert.equal(note.getModifiersByType('Dot').length, 0);
});

test('attachDots adds a visual Dot to a dotted quarter', () => {
  const note = new StaveNote({
    keys: ['f/4'],
    duration: vexDuration({ duration: 4, dotted: true, pitch: 65 }),
    clef: 'treble'
  });
  attachDots(note, true);
  assert.equal(note.getModifiersByType('Dot').length, 1);
});

test('attachDots leaves undotted notes unchanged', () => {
  const note = new StaveNote({
    keys: ['f/4'],
    duration: 'q',
    clef: 'treble'
  });
  attachDots(note, false);
  assert.equal(note.getModifiersByType('Dot').length, 0);
});
