import type { BackupSnapshot } from "../types/spotify";
import {
  buildBackupRefs,
  createBackupSnapshot,
  parseBackupSnapshotJson,
  planRestoreFromBackup,
  serializeBackupSnapshot,
  type RestorePlanResult,
} from "./backupCore";

export {
  buildBackupRefs,
  createBackupSnapshot,
  parseBackupSnapshotJson,
  planRestoreFromBackup,
  serializeBackupSnapshot,
  type RestorePlanResult,
};

const BACKUPS_STORAGE_KEY = "spotify_sorter:backups:v1";
const MAX_SNAPSHOTS_PER_PLAYLIST = 10;

type BackupStore = Record<string, BackupSnapshot[]>;

function readBackupStore(storage: Storage = localStorage): BackupStore {
  try {
    const raw = storage.getItem(BACKUPS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as BackupStore;
  } catch {
    return {};
  }
}

function writeBackupStore(
  store: BackupStore,
  storage: Storage = localStorage
): void {
  storage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(store));
}

export function listPlaylistBackups(
  playlistId: string,
  storage: Storage = localStorage
): BackupSnapshot[] {
  const store = readBackupStore(storage);
  return store[playlistId] ?? [];
}

export function savePlaylistBackup(
  snapshot: BackupSnapshot,
  storage: Storage = localStorage
): BackupSnapshot[] {
  const store = readBackupStore(storage);
  const existing = store[snapshot.playlistId] ?? [];
  const next = [snapshot, ...existing].slice(0, MAX_SNAPSHOTS_PER_PLAYLIST);
  store[snapshot.playlistId] = next;
  writeBackupStore(store, storage);
  return next;
}

export function deletePlaylistBackup(
  playlistId: string,
  backupId: string,
  storage: Storage = localStorage
): BackupSnapshot[] {
  const store = readBackupStore(storage);
  const next = (store[playlistId] ?? []).filter((b) => b.id !== backupId);
  store[playlistId] = next;
  writeBackupStore(store, storage);
  return next;
}
