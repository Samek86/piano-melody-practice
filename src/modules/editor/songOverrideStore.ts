import type { Song } from '../../types';

const STORAGE_KEY = 'piano-practice-song-overrides';
/** Previous override versions, newest last. Separate from the live override map. */
const BACKUP_STORAGE_KEY = 'piano-practice-song-override-backups';
const BACKUP_LIMIT = 30;

export interface SongOverrideBackup {
  /** Local time the previous override was archived, `YYYYMMDD-HHMMSS`. */
  savedAt: string;
  song: Song;
}

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

/** Local calendar time as `YYYYMMDD-HHMMSS` (backup stamp and download name). */
export function formatBackupStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function safeSongId(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned || 'song';
}

export function backupDownloadName(songId: string, savedAt: string): string {
  return `piano-backup-${safeSongId(songId)}-${savedAt}.json`;
}

function isBackup(value: unknown): value is SongOverrideBackup {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SongOverrideBackup>;
  return typeof entry.savedAt === 'string' && isSong(entry.song);
}

export function loadOverrideBackups(): SongOverrideBackup[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(BACKUP_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBackup);
  } catch {
    return [];
  }
}

function writeBackups(backups: SongOverrideBackup[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(BACKUP_STORAGE_KEY, JSON.stringify(backups));
  } catch {
    /* ignore quota / private mode */
  }
}

function downloadSongBackup(song: Song, savedAt: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const blob = new Blob([`${JSON.stringify(song, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupDownloadName(song.id, savedAt);
  document.body?.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL?.(url);
}

function archivePrevious(previous: Song, now: Date): void {
  const savedAt = formatBackupStamp(now);
  const backups = loadOverrideBackups();
  backups.push({ savedAt, song: previous });
  writeBackups(backups.slice(-BACKUP_LIMIT));
  try {
    downloadSongBackup(previous, savedAt);
  } catch {
    /* download is best-effort; the localStorage archive already ran */
  }
}

export function saveOverride(song: Song, now: Date = new Date()): void {
  const overrides = loadOverrides();
  const previous = overrides[song.id];
  if (previous) archivePrevious(previous, now);
  overrides[song.id] = song;
  writeOverrides(overrides);
}

export function clearOverride(id: string): void {
  const overrides = loadOverrides();
  if (!overrides[id]) return;
  delete overrides[id];
  writeOverrides(overrides);
}
