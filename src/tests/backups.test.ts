import { describe, expect, it } from "vitest";
import type { PlaylistEntry } from "../types/spotify";
import {
  createBackupSnapshot,
  listPlaylistBackups,
  parseBackupSnapshotJson,
  planRestoreFromBackup,
  savePlaylistBackup,
  serializeBackupSnapshot,
} from "../storage/backups";

function makeEntry(
  idx: number,
  uri: string,
  title = `Track ${idx}`
): PlaylistEntry {
  return {
    instanceKey: `${idx}::${uri}`,
    originalIndex: idx,
    kind: uri ? "track" : "unavailable",
    uri,
    id: uri || null,
    title,
    artists: ["Artist"],
    primaryArtist: "Artist",
    albumOrShow: "Album",
    releaseDateRaw: "2024-01-01",
    releaseDateSortKey: "2024-01-01",
    addedAt: "2025-01-01T00:00:00Z",
    addedById: "user1",
    durationMs: 180000,
    explicit: false,
    discNumber: 1,
    trackNumber: 1,
    artworkUrl: null,
    isLocal: false,
  };
}

describe("backups", () => {
  it("restores duplicate URIs accurately across fresh load instanceKeys", () => {
    const beforeCommit = [
      makeEntry(0, "spotify:track:dup", "Dup First"),
      makeEntry(1, "spotify:track:x", "Middle"),
      makeEntry(2, "spotify:track:dup", "Dup Second"),
    ];

    const snapshot = createBackupSnapshot(
      "pl-1",
      "Test Playlist",
      "snap-1",
      beforeCommit,
      "auto_pre_commit"
    );

    // Simulate a reloaded session where tracks were shuffled and got brand-new original indices
    const reloaded = [
      makeEntry(0, "spotify:track:x", "Middle"),
      makeEntry(1, "spotify:track:dup", "Dup First"),
      makeEntry(2, "spotify:track:dup", "Dup Second"),
    ];

    const plan = planRestoreFromBackup(reloaded, snapshot);
    expect(plan.status).toBe("exact");
    expect(plan.matchedCount).toBe(3);
    expect(plan.missingFromLive).toBe(0);
    expect(plan.addedSinceBackup).toBe(0);
    expect(plan.targetEntries.map((e) => e.instanceKey)).toEqual([
      reloaded[1].instanceKey,
      reloaded[0].instanceKey,
      reloaded[2].instanceKey,
    ]);
  });

  it("detects added and removed tracks since backup cleanly", () => {
    const before = [
      makeEntry(0, "spotify:track:a"),
      makeEntry(1, "spotify:track:b"),
      makeEntry(2, "spotify:track:c"),
    ];
    const snapshot = createBackupSnapshot(
      "pl-1",
      "Test",
      "snap-1",
      before,
      "manual_export"
    );

    const liveModified = [
      makeEntry(0, "spotify:track:c"),
      makeEntry(1, "spotify:track:new1"),
      makeEntry(2, "spotify:track:a"),
    ];

    const plan = planRestoreFromBackup(liveModified, snapshot);
    expect(plan.status).toBe("modified");
    expect(plan.matchedCount).toBe(2);
    expect(plan.missingFromLive).toBe(1);
    expect(plan.addedSinceBackup).toBe(1);
    expect(plan.targetEntries.map((e) => e.uri)).toEqual([
      "spotify:track:a",
      "spotify:track:c",
      "spotify:track:new1",
    ]);
  });

  it("caps stored backups per playlist at 10 and roundtrips JSON", () => {
    localStorage.clear();
    const entries = [makeEntry(0, "spotify:track:1")];

    for (let i = 0; i < 12; i++) {
      const snap = createBackupSnapshot(
        "pl-cap",
        "Cap Test",
        `snap-${i}`,
        entries,
        "auto_pre_commit"
      );
      savePlaylistBackup(snap);
    }

    const saved = listPlaylistBackups("pl-cap");
    expect(saved).toHaveLength(10);
    expect(saved[0].snapshotId).toBe("snap-11");

    const json = serializeBackupSnapshot(saved[0]);
    const parsed = parseBackupSnapshotJson(json);
    expect(parsed.playlistId).toBe("pl-cap");
    expect(parsed.entries).toHaveLength(1);
  });
});
