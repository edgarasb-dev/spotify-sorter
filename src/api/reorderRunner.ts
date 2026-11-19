import type { BackupSnapshot, MoveOp, PlaylistEntry } from "../types/spotify";
import { applyMoves } from "../sorter/diffPlanner";
import {
  createBackupSnapshot,
  savePlaylistBackup,
} from "../storage/backups";
import { fetchAllPlaylistItems, fetchSnapshotId } from "./playlists";
import { abortableSleep, SpotifyApiError, spotifyFetch } from "./spotifyClient";

export class SnapshotConflictError extends Error {
  completedMoves: number;

  constructor(message: string, completedMoves = 0) {
    super(message);
    this.name = "SnapshotConflictError";
    this.completedMoves = completedMoves;
  }
}

export interface ReorderProgress {
  completedMoves: number;
  totalMoves: number;
  currentMove?: MoveOp;
  rateLimitWaitSeconds: number | null;
  phase: "checking" | "committing" | "verifying";
}

export interface ReorderCommitResult {
  snapshotId: string;
  liveItems: PlaylistEntry[];
  verified: boolean;
  backupSnapshot: BackupSnapshot;
  completedMoves: number;
}

export async function commitPlaylistReorder(params: {
  playlistId: string;
  playlistName: string;
  expectedSnapshotId: string;
  currentEntries: readonly PlaylistEntry[];
  targetEntries: readonly PlaylistEntry[];
  moves: readonly MoveOp[];
  signal?: AbortSignal;
  onProgress?: (progress: ReorderProgress) => void;
}): Promise<ReorderCommitResult> {
  const {
    playlistId,
    playlistName,
    expectedSnapshotId,
    currentEntries,
    targetEntries,
    moves,
    signal,
    onProgress,
  } = params;

  if (moves.length === 0) {
    throw new Error("No reorder moves to apply.");
  }

  // Verify locally before making any write calls to Spotify.
  const currentKeys = currentEntries.map((e) => e.instanceKey);
  const targetKeys = targetEntries.map((e) => e.instanceKey);
  const simulated = applyMoves(currentKeys, moves);
  if (
    simulated.length !== targetKeys.length ||
    simulated.some((k, idx) => k !== targetKeys[idx])
  ) {
    throw new Error("Local reorder self-check failed. Aborted before touching Spotify.");
  }

  onProgress?.({
    completedMoves: 0,
    totalMoves: moves.length,
    rateLimitWaitSeconds: null,
    phase: "checking",
  });

  // Check live snapshot_id and total item count to detect concurrent edits.
  const liveSnapshotId = await fetchSnapshotId(playlistId);
  if (liveSnapshotId !== expectedSnapshotId) {
    throw new SnapshotConflictError(
      "Playlist was modified elsewhere (snapshot mismatch). Reload the playlist before applying."
    );
  }

  const countCheck = await spotifyFetch<{ total: number }>(
    `/playlists/${encodeURIComponent(playlistId)}/items?limit=1&offset=0&additional_types=track,episode`,
    { signal }
  );
  if (countCheck.total !== currentEntries.length) {
    throw new SnapshotConflictError(
      `Playlist length changed (${currentEntries.length} -> ${countCheck.total}). Reload the playlist before applying.`
    );
  }

  // Save pre-commit backup snapshot before executing any PUT requests.
  const backupSnapshot = createBackupSnapshot(
    playlistId,
    playlistName,
    expectedSnapshotId,
    currentEntries,
    "auto_pre_commit"
  );
  savePlaylistBackup(backupSnapshot);

  let activeSnapshotId = liveSnapshotId;
  let completedMoves = 0;

  for (let i = 0; i < moves.length; i++) {
    if (signal?.aborted) {
      throw new DOMException("Commit cancelled", "AbortError");
    }

    const op = moves[i];
    onProgress?.({
      completedMoves,
      totalMoves: moves.length,
      currentMove: op,
      rateLimitWaitSeconds: null,
      phase: "committing",
    });

    try {
      const response = await spotifyFetch<{ snapshot_id: string }>(
        `/playlists/${encodeURIComponent(playlistId)}/items`,
        {
          method: "PUT",
          body: {
            range_start: op.range_start,
            insert_before: op.insert_before,
            range_length: op.range_length,
            snapshot_id: activeSnapshotId,
          },
          signal,
          onRateLimit: (waitSeconds) => {
            onProgress?.({
              completedMoves,
              totalMoves: moves.length,
              currentMove: op,
              rateLimitWaitSeconds: waitSeconds,
              phase: "committing",
            });
          },
        }
      );

      activeSnapshotId = response.snapshot_id || activeSnapshotId;
      completedMoves += 1;

      onProgress?.({
        completedMoves,
        totalMoves: moves.length,
        currentMove: op,
        rateLimitWaitSeconds: null,
        phase: "committing",
      });
    } catch (error) {
      if (
        error instanceof SpotifyApiError &&
        (error.status === 400 || error.status === 409)
      ) {
        throw new SnapshotConflictError(
          `Spotify rejected step ${i + 1}/${moves.length} (${error.message}). Reload the playlist to resync.`,
          completedMoves
        );
      }
      throw error;
    }

    if (i < moves.length - 1) {
      await abortableSleep(120, signal);
    }
  }

  onProgress?.({
    completedMoves,
    totalMoves: moves.length,
    rateLimitWaitSeconds: null,
    phase: "verifying",
  });

  const { items: liveItems, snapshotId: finalSnapshotId } =
    await fetchAllPlaylistItems(playlistId);

  const verified =
    liveItems.length === targetEntries.length &&
    liveItems.every(
      (item, idx) =>
        (item.uri || "__unavailable__") ===
        (targetEntries[idx].uri || "__unavailable__")
    );

  return {
    snapshotId: finalSnapshotId || activeSnapshotId,
    liveItems,
    verified,
    backupSnapshot,
    completedMoves,
  };
}
