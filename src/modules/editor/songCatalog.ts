import type { Song } from '../../types';

export function mergeSongs(base: Song[], overrides: Record<string, Song>): Song[] {
  if (Object.keys(overrides).length === 0) return base;
  const ids = new Set(base.map((song) => song.id));
  const merged = base.map((song) => overrides[song.id] ?? song);
  const extras = Object.values(overrides).filter((song) => !ids.has(song.id));
  extras.sort((a, b) => a.titleKo.localeCompare(b.titleKo, 'ko'));
  return extras.length > 0 ? [...merged, ...extras] : merged;
}
