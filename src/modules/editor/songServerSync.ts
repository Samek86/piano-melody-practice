import type { Song } from '../../types';
import {
  clearOverride,
  isSong,
  loadOverrides,
  replaceOverrides,
  saveOverride
} from './songOverrideStore.ts';

export const SONG_OVERRIDES_API = '/api/song-overrides';
const ADMIN_TOKEN_KEY = 'piano-practice-admin-token';

const TOKEN_PROMPT = '서버 저장용 관리자 토큰을 입력하세요. 이 브라우저에만 기억합니다.';
const TOKEN_RETRY_PROMPT = '관리자 토큰이 맞지 않습니다. 다시 입력하면 이 브라우저에만 기억합니다.';

export class SongServerError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`song-server-${status}`);
    this.name = 'SongServerError';
    this.status = status;
  }
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/**
 * Online: the server map is the whole override set.
 * Offline (`server === null`): keep this browser's copy.
 */
export function mergeOverrideSources(
  local: Record<string, Song>,
  server: Record<string, Song> | null
): Record<string, Song> {
  if (server == null) return local;
  return server;
}

export function songOverrideUrl(id: string): string {
  return `${SONG_OVERRIDES_API}/${encodeURIComponent(id)}`;
}

export function parseServerOverridePayload(payload: unknown): Record<string, Song> | null {
  if (!payload || typeof payload !== 'object') return null;
  const songs = (payload as { songs?: unknown }).songs;
  if (!songs || typeof songs !== 'object' || Array.isArray(songs)) return null;
  const out: Record<string, Song> = {};
  for (const [id, value] of Object.entries(songs as Record<string, unknown>)) {
    if (isSong(value) && value.id === id) out[id] = value;
  }
  return out;
}

export function readAdminToken(): string {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(ADMIN_TOKEN_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function storeAdminToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token.trim());
}

export function clearAdminToken(): void {
  try {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function ensureAdminToken(
  prompt: (message: string) => string | null,
  reprompt = false
): string | null {
  if (!reprompt) {
    const existing = readAdminToken();
    if (existing) return existing;
  } else {
    clearAdminToken();
  }
  const entered = prompt(reprompt ? TOKEN_RETRY_PROMPT : TOKEN_PROMPT)?.trim() ?? '';
  if (!entered) return null;
  storeAdminToken(entered);
  return entered;
}

export function serverSaveErrorMessage(error: unknown): string {
  if (error instanceof SongServerError && error.status === 503) {
    return '서버에 관리자 토큰 파일이 아직 없습니다.';
  }
  if (error instanceof SongServerError && error.status === 401) {
    return '관리자 토큰이 맞지 않습니다.';
  }
  return '서버에 저장하지 못했습니다. 연결을 확인한 뒤 다시 저장해 주세요.';
}

export async function fetchServerOverrides(fetchImpl: FetchLike = fetch): Promise<Record<string, Song> | null> {
  try {
    const response = await fetchImpl(SONG_OVERRIDES_API, { cache: 'no-store' });
    if (!response.ok) return null;
    return parseServerOverridePayload(await response.json());
  } catch {
    return null;
  }
}

export async function putServerOverride(song: Song, token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(songOverrideUrl(song.id), {
      method: 'PUT',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Piano-Admin-Token': token
      },
      body: JSON.stringify(song)
    });
  } catch {
    throw new SongServerError(0);
  }
  if (!response.ok) throw new SongServerError(response.status);
}

export async function deleteServerOverride(id: string, token: string, fetchImpl: FetchLike = fetch): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(songOverrideUrl(id), {
      method: 'DELETE',
      cache: 'no-store',
      headers: { 'X-Piano-Admin-Token': token }
    });
  } catch {
    throw new SongServerError(0);
  }
  if (response.status === 404) return;
  if (!response.ok) throw new SongServerError(response.status);
}

let remote: Record<string, Song> | null = null;
let generation = 0;

export function resetServerOverrideCache(): void {
  remote = null;
  generation += 1;
}

export function effectiveOverrides(): Record<string, Song> {
  return mergeOverrideSources(loadOverrides(), remote);
}

export async function syncServerOverrides(fetchImpl: FetchLike = fetch): Promise<void> {
  const gen = ++generation;
  const songs = await fetchServerOverrides(fetchImpl);
  if (songs == null || gen !== generation) return;
  remote = songs;
  replaceOverrides(songs);
}

export function rememberSavedOverride(song: Song): void {
  generation += 1;
  const base = { ...(remote ?? loadOverrides()) };
  remote = { ...base, [song.id]: song };
  saveOverride(song);
}

export function rememberClearedOverride(id: string): void {
  generation += 1;
  const base = { ...(remote ?? loadOverrides()) };
  delete base[id];
  remote = base;
  if (loadOverrides()[id]) clearOverride(id);
  else replaceOverrides(base);
}
