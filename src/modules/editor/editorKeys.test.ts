import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editorKeyCommand, type EditorKeyInput } from './editorKeys.ts';

function key(partial: Partial<EditorKeyInput> & Pick<EditorKeyInput, 'key'>): EditorKeyInput {
  return { shiftKey: false, metaKey: false, ctrlKey: false, ...partial };
}

test('pitch changes only with Shift+ArrowUp and Shift+ArrowDown', () => {
  assert.equal(editorKeyCommand(key({ key: 'ArrowUp', shiftKey: true })), 'pitch-up');
  assert.equal(editorKeyCommand(key({ key: 'ArrowDown', shiftKey: true })), 'pitch-down');
  assert.equal(editorKeyCommand(key({ key: 'ArrowUp' })), null);
  assert.equal(editorKeyCommand(key({ key: 'ArrowDown' })), null);
});

test('left and right move between notes with or without Shift', () => {
  assert.equal(editorKeyCommand(key({ key: 'ArrowLeft' })), 'cursor-prev');
  assert.equal(editorKeyCommand(key({ key: 'ArrowRight' })), 'cursor-next');
  assert.equal(editorKeyCommand(key({ key: 'ArrowLeft', shiftKey: true })), 'cursor-prev');
  assert.equal(editorKeyCommand(key({ key: 'ArrowRight', shiftKey: true })), 'cursor-next');
});

test('undo, redo, and delete shortcuts stay the same', () => {
  assert.equal(editorKeyCommand(key({ key: 'z', ctrlKey: true })), 'undo');
  assert.equal(editorKeyCommand(key({ key: 'z', metaKey: true, shiftKey: true })), 'redo');
  assert.equal(editorKeyCommand(key({ key: 'y', ctrlKey: true })), 'redo');
  assert.equal(editorKeyCommand(key({ key: 'Delete' })), 'delete');
  assert.equal(editorKeyCommand(key({ key: 'Backspace' })), 'delete');
  assert.equal(editorKeyCommand(key({ key: 'z' })), null);
});
