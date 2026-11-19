import type {
  BackupEntryRef,
  BackupSnapshot,
  PlaylistEntry,
} from "../types/spotify";

export function getEntryBackupUri(entry: PlaylistEntry): string {
  return entry.uri || "__unavailable__";
}

export function buildBackupRefs(
  entries: readonly PlaylistEntry[]
): BackupEntryRef[] {
  const counts = new Map<string, number>();
  return entries.map((entry) => {
    const uri = getEntryBackupUri(entry);
    const occurrenceIndex = counts.get(uri) ?? 0;
    counts.set(uri, occurrenceIndex + 1);
    return {
      uri,
      occurrenceIndex,
      title: entry.title,
      artist: entry.primaryArtist,
      kind: entry.kind,
    };
  });
}

export function createBackupSnapshot(
  playlistId: string,
  playlistName: string,
  snapshotId: string,
  entries: readonly PlaylistEntry[],
  reason: BackupSnapshot["reason"]
): BackupSnapshot {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    playlistId,
    playlistName,
    createdAt: new Date().toISOString(),
    snapshotId,
    itemCount: entries.length,
    reason,
    entries: buildBackupRefs(entries),
  };
}

export interface RestorePlanResult {
  status: "exact" | "modified";
  targetEntries: PlaylistEntry[];
  matchedCount: number;
  missingFromLive: number;
  addedSinceBackup: number;
}

function occurrenceKey(uri: string, occurrenceIndex: number): string {
  return `${uri}::#${occurrenceIndex}`;
}

export function planRestoreFromBackup(
  liveEntries: readonly PlaylistEntry[],
  backup: BackupSnapshot
): RestorePlanResult {
  const liveCounts = new Map<string, number>();
  const liveByKey = new Map<string, PlaylistEntry>();

  for (const entry of liveEntries) {
    const uri = getEntryBackupUri(entry);
    const occ = liveCounts.get(uri) ?? 0;
    liveCounts.set(uri, occ + 1);
    liveByKey.set(occurrenceKey(uri, occ), entry);
  }

  const usedKeys = new Set<string>();
  const matchedEntries: PlaylistEntry[] = [];
  let missingFromLive = 0;

  for (const ref of backup.entries) {
    const key = occurrenceKey(ref.uri, ref.occurrenceIndex);
    const liveMatch = liveByKey.get(key);
    if (liveMatch && !usedKeys.has(liveMatch.instanceKey)) {
      usedKeys.add(liveMatch.instanceKey);
      matchedEntries.push(liveMatch);
    } else {
      missingFromLive += 1;
    }
  }

  const extraLiveEntries = liveEntries.filter(
    (entry) => !usedKeys.has(entry.instanceKey)
  );
  const addedSinceBackup = extraLiveEntries.length;

  const isExact =
    missingFromLive === 0 &&
    addedSinceBackup === 0 &&
    matchedEntries.length === liveEntries.length;

  return {
    status: isExact ? "exact" : "modified",
    targetEntries: [...matchedEntries, ...extraLiveEntries],
    matchedCount: matchedEntries.length,
    missingFromLive,
    addedSinceBackup,
  };
}

export function serializeBackupSnapshot(snapshot: BackupSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function parseBackupSnapshotJson(rawJson: string): BackupSnapshot {
  const parsed = JSON.parse(rawJson) as Partial<BackupSnapshot>;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.playlistId !== "string" ||
    typeof parsed.playlistName !== "string" ||
    typeof parsed.snapshotId !== "string" ||
    !Array.isArray(parsed.entries)
  ) {
    throw new Error("Invalid backup JSON format.");
  }

  for (const ref of parsed.entries) {
    if (
      !ref ||
      typeof ref !== "object" ||
      typeof ref.uri !== "string" ||
      typeof ref.occurrenceIndex !== "number"
    ) {
      throw new Error("Backup JSON contains malformed entry references.");
    }
  }

  return {
    id:
      typeof parsed.id === "string"
        ? parsed.id
        : `imported-${Date.now()}`,
    playlistId: parsed.playlistId,
    playlistName: parsed.playlistName,
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date().toISOString(),
    snapshotId: parsed.snapshotId,
    itemCount: parsed.entries.length,
    reason:
      parsed.reason === "auto_pre_commit" || parsed.reason === "auto_vps"
        ? parsed.reason
        : "manual_export",
    entries: parsed.entries,
  };
}
