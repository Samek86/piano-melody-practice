import { useMemo, useSyncExternalStore } from 'react';
import type { Song } from '../../types';
import { allSongs } from '../../data/songIndex';
import { mergeSongs } from './songCatalog';

const STORAGE_KEY = 'piano-practice-song-overrides';

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

function emit(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function subscribeSongCatalog(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSongCatalogVersion(): number {
  return version;
}

function isSong(value: unknown): value is Song {
  if (!value || typeof value !== 'object') return false;
  const song = value as Partial<Song>;
  return (
    typeof song.id === 'string' &&
    typeof song.title === 'string' &&
    typeof song.titleKo === 'string' &&
    typeof song.key === 'string' &&
    typeof song.tempo === 'number' &&
    Array.isArray(song.timeSignature) &&
    song.timeSignature.length === 2 &&
    Array.isArray(song.notes)
  );
}

export function loadOverrides(): Record<string, Song> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, Song> = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (isSong(value) && value.id === id) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOverrides(overrides: Record<string, Song>): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* ignore quota / private mode */
  }
  emit();
}

export function saveOverride(song: Song): void {
  const overrides = loadOverrides();
  overrides[song.id] = song;
  writeOverrides(overrides);
}

export function clearOverride(id: string): void {
  const overrides = loadOverrides();
  if (!overrides[id]) return;
  delete overrides[id];
  writeOverrides(overrides);
}

export function useSongCatalog(): Song[] {
  const current = useSyncExternalStore(subscribeSongCatalog, getSongCatalogVersion, getSongCatalogVersion);
  return useMemo(() => mergeSongs(allSongs, loadOverrides()), [current]);
}

export function useOverrideIds(): Set<string> {
  const current = useSyncExternalStore(subscribeSongCatalog, getSongCatalogVersion, getSongCatalogVersion);
  return useMemo(() => new Set(Object.keys(loadOverrides())), [current]);
}
