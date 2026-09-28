import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import type { Song } from '../../types.ts';
import { mergeSongs } from './songCatalog.ts';
import {
  deleteServerOverride,
  effectiveOverrides,
  ensureAdminToken,
  fetchServerOverrides,
  mergeOverrideSources,
  parseServerOverridePayload,
  putServerOverride,
  rememberSavedOverride,
  resetServerOverrideCache,
  SongServerError,
  songOverrideUrl,
  syncServerOverrides
} from './songServerSync.ts';

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
    notes: [{ pitch: 60, duration: 4, finger: 2 }],
    tags: []
  };
}

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
  resetServerOverrideCache();
});

afterEach(() => {
  resetServerOverrideCache();
});

test('server overrides replace local ones, and offline keeps local', () => {
  const bundled = [song('school-bell', '수록')];
  const local = { 'school-bell': song('school-bell', '브라우저') };
  const server = { 'school-bell': song('school-bell', '서버') };

  const online = mergeSongs(bundled, mergeOverrideSources(local, server));
  assert.equal(online[0].titleKo, '서버');

  const offline = mergeSongs(bundled, mergeOverrideSources(local, null));
  assert.equal(offline[0].titleKo, '브라우저');

  const emptyServer = mergeSongs(bundled, mergeOverrideSources(local, {}));
  assert.equal(emptyServer[0].titleKo, '수록');
});

test('parse keeps valid songs and drops malformed entries', () => {
  const parsed = parseServerOverridePayload({
    songs: {
      'school-bell': song('school-bell', '서버'),
      bad: { id: 'other' },
      mismatch: song('nope', '아이디 불일치')
    }
  });
  assert.deepEqual(Object.keys(parsed ?? {}), ['school-bell']);
  assert.equal(parseServerOverridePayload({}), null);
  assert.equal(parseServerOverridePayload(null), null);
});

test('put sends the song and admin token header, without a GitHub write', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const saved = song('school-bell', '연습확인곡');
  await putServerOverride(saved, 'test-token', async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response('{"ok":true}', { status: 200 });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, songOverrideUrl('school-bell'));
  assert.equal(calls[0].init?.method, 'PUT');
  const headers = calls[0].init?.headers as Record<string, string>;
  assert.equal(headers['X-Piano-Admin-Token'], 'test-token');
  assert.equal(JSON.parse(String(calls[0].init?.body)).titleKo, '연습확인곡');
  assert.equal(JSON.parse(String(calls[0].init?.body)).notes[0].finger, 2);
});

test('put maps HTTP 401 to SongServerError and delete treats 404 as gone', async () => {
  await assert.rejects(
    () => putServerOverride(song('school-bell', '곡'), 'nope', async () => new Response('', { status: 401 })),
    (error: unknown) => error instanceof SongServerError && error.status === 401
  );
  await deleteServerOverride('school-bell', 'test-token', async () => new Response('', { status: 404 }));
});

test('a stale server list does not overwrite a save that finished first', async () => {
  let release: (response: Response) => void = () => {};
  const pending = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const syncing = syncServerOverrides(async () => pending);
  rememberSavedOverride(song('school-bell', '방금 저장'));
  release(new Response(JSON.stringify({ songs: { 'school-bell': song('school-bell', '오래된 서버') } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  }));
  await syncing;
  assert.equal(effectiveOverrides()['school-bell'].titleKo, '방금 저장');
});

test('fetch stores the server list and a later read uses it', async () => {
  await syncServerOverrides(async () => new Response(JSON.stringify({
    songs: { 'school-bell': song('school-bell', '서버곡') }
  }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  assert.equal(effectiveOverrides()['school-bell'].titleKo, '서버곡');
  const again = await fetchServerOverrides(async () => {
    throw new Error('offline');
  });
  assert.equal(again, null);
});

test('admin token is remembered in this browser and replaced when re-prompted', () => {
  const prompts: string[] = [];
  assert.equal(ensureAdminToken(() => {
    prompts.push('asked');
    return ' first ';
  }), 'first');
  assert.equal(ensureAdminToken(() => {
    prompts.push('again');
    return 'second';
  }), 'first');
  assert.equal(prompts.length, 1);
  assert.equal(ensureAdminToken(() => ' second ', true), 'second');
});
