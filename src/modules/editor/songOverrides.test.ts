import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { Song } from '../../types.ts';
import { loadOverrideBackups, loadOverrides, saveOverride } from './songOverrideStore.ts';

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
    notes: [{ pitch: 60, duration: 4, finger: 1 }],
    tags: []
  };
}

const downloads: string[] = [];

beforeEach(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
      clear: () => {
        store.clear();
      }
    }
  });
  downloads.length = 0;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    writable: true,
    value: {
      body: {
        appendChild<T>(node: T): T {
          return node;
        }
      },
      createElement(): { href: string; download: string; click: () => void; remove: () => void } {
        const link = {
          href: '',
          download: '',
          click() {
            downloads.push(link.download);
          },
          remove() {}
        };
        return link;
      }
    }
  });
  URL.createObjectURL = (() => 'blob:backup') as typeof URL.createObjectURL;
  URL.revokeObjectURL = (() => undefined) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(URL, 'createObjectURL');
  Reflect.deleteProperty(URL, 'revokeObjectURL');
});

test('save replaces override and archives the previous song with a timestamp', () => {
  const first = song('school-bell', '학교 원본편집');
  const next = song('school-bell', '학교 수정');

  saveOverride(first, new Date(2026, 8, 28, 23, 33, 5));
  assert.deepEqual(loadOverrideBackups(), []);
  assert.deepEqual(downloads, []);
  assert.equal(loadOverrides()['school-bell'].titleKo, '학교 원본편집');

  saveOverride(next, new Date(2026, 8, 28, 23, 45, 9));

  const backups = loadOverrideBackups();
  assert.equal(backups.length, 1);
  assert.equal(backups[0].savedAt, '20260928-234509');
  assert.equal(backups[0].song.titleKo, '학교 원본편집');
  assert.equal(backups[0].song.notes[0].finger, 1);
  assert.equal(loadOverrides()['school-bell'].titleKo, '학교 수정');
  assert.deepEqual(downloads, ['piano-backup-school-bell-20260928-234509.json']);
});

test('a first save of a different song id does not archive', () => {
  saveOverride(song('school-bell', '학교'), new Date(2026, 0, 1, 0, 0, 1));
  saveOverride(song('tulip', '튤립'), new Date(2026, 0, 1, 0, 0, 2));
  assert.equal(loadOverrideBackups().length, 0);
  assert.deepEqual(downloads, []);
});

test('override backups keep the last 30 versions', () => {
  saveOverride(song('school-bell', 'v0'), new Date(2026, 0, 1, 0, 0, 0));
  for (let i = 1; i <= 31; i++) {
    saveOverride(song('school-bell', `v${i}`), new Date(2026, 0, 1, 0, 0, i));
  }
  const backups = loadOverrideBackups();
  assert.equal(backups.length, 30);
  assert.equal(backups[0].song.titleKo, 'v1');
  assert.equal(backups[0].savedAt, '20260101-000002');
  assert.equal(backups[29].song.titleKo, 'v30');
  assert.equal(backups[29].savedAt, '20260101-000031');
  assert.equal(loadOverrides()['school-bell'].titleKo, 'v31');
  assert.equal(downloads.length, 31);
  assert.equal(downloads[0], 'piano-backup-school-bell-20260101-000001.json');
  assert.equal(downloads[30], 'piano-backup-school-bell-20260101-000031.json');
});
