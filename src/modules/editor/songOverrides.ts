import { useMemo, useSyncExternalStore } from 'react';
import type { Song } from '../../types';
import { allSongs } from '../../data/songIndex';
import { mergeSongs } from './songCatalog';
import {
  getSongCatalogVersion,
  loadOverrides,
  subscribeSongCatalog
} from './songOverrideStore';

export {
  backupDownloadName,
  clearOverride,
  formatBackupStamp,
  getSongCatalogVersion,
  loadOverrideBackups,
  loadOverrides,
  saveOverride,
  subscribeSongCatalog,
  type SongOverrideBackup
} from './songOverrideStore';

export function useSongCatalog(): Song[] {
  const current = useSyncExternalStore(subscribeSongCatalog, getSongCatalogVersion, getSongCatalogVersion);
  return useMemo(() => mergeSongs(allSongs, loadOverrides()), [current]);
}

export function useOverrideIds(): Set<string> {
  const current = useSyncExternalStore(subscribeSongCatalog, getSongCatalogVersion, getSongCatalogVersion);
  return useMemo(() => new Set(Object.keys(loadOverrides())), [current]);
}
