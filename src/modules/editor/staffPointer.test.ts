import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StaffPointerGesture, type StaffPointerPoint } from './staffPointer.ts';

function point(x: number, y: number, extra: Partial<StaffPointerPoint> = {}): StaffPointerPoint {
  return { pointerId: 1, button: 0, altKey: false, clientX: x, clientY: y, ...extra };
}

const note = (index: number, rest = false) => ({ kind: 'note' as const, index, rest });

test('a plain vertical drag never changes pitch', () => {
  const gesture = new StaffPointerGesture();
  const down = gesture.down(point(40, 100), note(2), 2, 8);
  assert.equal(down.capturePointer, false);
  assert.deepEqual(down.effect, { type: 'none' });

  const move = gesture.move(point(40, 20));
  assert.equal(move.capturePointer, false);
  assert.deepEqual(move.effect, { type: 'none' });

  const up = gesture.up(point(40, 20));
  assert.deepEqual(up.effect, { type: 'none' });
  assert.equal(up.tracking, false);
});

test('a plain horizontal drag does not select or insert', () => {
  const gesture = new StaffPointerGesture();
  gesture.down(point(10, 40), { kind: 'gap', index: 3 }, -1, 8);
  gesture.move(point(80, 42));
  assert.deepEqual(gesture.up(point(80, 42)).effect, { type: 'none' });
});

test('a click selects a note and a click on a gap inserts', () => {
  const notes = new StaffPointerGesture();
  notes.down(point(10, 10), note(4), -1, 8);
  notes.move(point(12, 11));
  assert.deepEqual(notes.up(point(12, 11)).effect, { type: 'select', index: 4 });

  const gaps = new StaffPointerGesture();
  gaps.down(point(10, 10), { kind: 'gap', index: 1 }, -1, 8);
  assert.deepEqual(gaps.up(point(10, 10)).effect, { type: 'insert', index: 1 });
});

test('pointercancel while scrolling does not select or insert', () => {
  const gesture = new StaffPointerGesture();
  gesture.down(point(10, 10), note(0), 0, 8);
  gesture.move(point(10, 40));
  assert.deepEqual(gesture.cancel(point(10, 40)).effect, { type: 'none' });

  gesture.down(point(4, 4), { kind: 'gap', index: 2 }, -1, 8);
  assert.deepEqual(gesture.up(point(4, 4)).effect, { type: 'insert', index: 2 });
});

test('alt-drag on the selected notehead adjusts pitch and captures the pointer', () => {
  const gesture = new StaffPointerGesture();
  const down = gesture.down(point(20, 100, { altKey: true }), note(1), 1, 10);
  assert.equal(down.capturePointer, true);
  assert.deepEqual(down.effect, { type: 'none' });

  assert.deepEqual(gesture.move(point(20, 97, { altKey: true })).effect, { type: 'none' });
  assert.deepEqual(gesture.move(point(20, 80, { altKey: true })).effect, {
    type: 'pitch',
    index: 1,
    deltaSteps: 2,
    phase: 'move'
  });
  assert.deepEqual(gesture.move(point(20, 80, { altKey: true })).effect, { type: 'none' });
  assert.deepEqual(gesture.up(point(20, 80, { altKey: false })).effect, {
    type: 'pitch',
    index: 1,
    deltaSteps: 2,
    phase: 'end'
  });
});

test('a drag that only reports its movement on pointerup does not select or insert', () => {
  const gesture = new StaffPointerGesture();
  gesture.down(point(10, 10), note(0), 0, 8);
  assert.deepEqual(gesture.up(point(10, 48)).effect, { type: 'none' });
});

test('alt pitch uses the pointerup position when no move event arrived', () => {
  const gesture = new StaffPointerGesture();
  gesture.down(point(0, 100, { altKey: true }), note(0), 0, 10);
  assert.deepEqual(gesture.up(point(0, 70, { altKey: true })).effect, {
    type: 'pitch',
    index: 0,
    deltaSteps: 3,
    phase: 'end'
  });
});

test('alt-drag does not change pitch on an unselected note, a rest, or without alt', () => {
  const unselected = new StaffPointerGesture();
  const down = unselected.down(point(0, 100, { altKey: true }), note(3), 1, 10);
  assert.equal(down.capturePointer, false);
  unselected.move(point(0, 40, { altKey: true }));
  assert.deepEqual(unselected.up(point(0, 40)).effect, { type: 'none' });

  const rest = new StaffPointerGesture();
  assert.equal(rest.down(point(0, 0, { altKey: true }), note(1, true), 1, 10).capturePointer, false);

  const plain = new StaffPointerGesture();
  plain.down(point(0, 100), note(1), 1, 10);
  assert.deepEqual(plain.move(point(0, 40)).effect, { type: 'none' });
});

test('cancelling an alt pitch drag reverts instead of committing', () => {
  const gesture = new StaffPointerGesture();
  gesture.down(point(0, 100, { altKey: true }), note(0), 0, 10);
  gesture.move(point(0, 50, { altKey: true }));
  assert.deepEqual(gesture.cancel(point(0, 50)).effect, {
    type: 'pitch',
    index: 0,
    deltaSteps: 5,
    phase: 'cancel'
  });
});

test('alt-click on the selected note selects and does not change pitch', () => {
  const gesture = new StaffPointerGesture();
  gesture.down(point(5, 5, { altKey: true }), note(2), 2, 8);
  assert.deepEqual(gesture.up(point(5, 5, { altKey: true })).effect, { type: 'select', index: 2 });
});

test('a non-primary button does not start a gesture', () => {
  const gesture = new StaffPointerGesture();
  const down = gesture.down(point(0, 0, { button: 2, altKey: true }), note(0), 0, 8);
  assert.equal(down.tracking, false);
  assert.deepEqual(gesture.move(point(0, -40, { button: 2, altKey: true })).effect, { type: 'none' });
});
