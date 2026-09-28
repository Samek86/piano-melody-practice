import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Song } from '../../types.ts';
import { mergeSongs } from './songCatalog.ts';

function song(id: string, titleKo: string): Song {
  return {
    id,
    title: id,
    titleKo,
    origin: 'korean',
    difficulty: 'beginner',
    tempo: 100,
    timeSignature: [4, 4],
    key: 'C',
    notes: [{ pitch: 60, duration: 4 }],
    tags: []
  };
}

test('overrides replace a stock song and custom songs are appended', () => {
  const base = [song('school-bell', '학교'), song('tulip', '튤립')];
  const edited = { ...base[0], titleKo: '학교 (편집)', tempo: 80 };
  const custom = song('custom-1', '새 멜로디');
  const merged = mergeSongs(base, { 'school-bell': edited, 'custom-1': custom });

  assert.equal(merged[0].titleKo, '학교 (편집)');
  assert.equal(merged[0].tempo, 80);
  assert.equal(merged[1], base[1]);
  assert.equal(merged[2].id, 'custom-1');
  assert.equal(base[0].titleKo, '학교');
});

test('an empty override map returns the original list', () => {
  const base = [song('a', '가')];
  assert.equal(mergeSongs(base, {}), base);
});
