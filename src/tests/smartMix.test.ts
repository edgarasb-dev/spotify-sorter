import { describe, expect, it } from "vitest";
import type { PlaylistEntry } from "../types/spotify";
import {
  artistSpreadMix,
  countConsecutiveSameArtist,
  trueShuffleMix,
} from "../sorter/smartMix";

function makeTrack(idx: number, artist: string): PlaylistEntry {
  return {
    instanceKey: `${idx}::spotify:track:${idx}`,
    originalIndex: idx,
    kind: "track",
    uri: `spotify:track:${idx}`,
    id: `${idx}`,
    title: `Track ${idx}`,
    artists: [artist],
    primaryArtist: artist,
    albumOrShow: "Album",
    releaseDateRaw: "2023-01-01",
    releaseDateSortKey: "2023-01-01",
    addedAt: "2025-01-01T00:00:00Z",
    addedById: "me",
    durationMs: 200000,
    explicit: false,
    discNumber: 1,
    trackNumber: idx + 1,
    artworkUrl: null,
    isLocal: false,
  };
}

describe("smartMix", () => {
  it("achieves 0 consecutive same-artist plays when maxCount <= ceil(N / 2)", () => {
    const entries = [
      makeTrack(0, "Artist A"),
      makeTrack(1, "Artist A"),
      makeTrack(2, "Artist A"),
      makeTrack(3, "Artist A"),
      makeTrack(4, "Artist B"),
      makeTrack(5, "Artist B"),
      makeTrack(6, "Artist C"),
      makeTrack(7, "Artist D"),
    ];

    const mixed = artistSpreadMix(entries);
    expect(mixed).toHaveLength(entries.length);
    expect(new Set(mixed.map((e) => e.instanceKey))).toEqual(
      new Set(entries.map((e) => e.instanceKey))
    );
    expect(countConsecutiveSameArtist(mixed)).toBe(0);
  });

  it("terminates and minimizes repeats even when one artist is >50% of the playlist", () => {
    // 7 tracks of A, 3 tracks of B/C -> theoretical minimum consecutive repeats = 7 - (3 + 1) = 3
    const entries = [
      makeTrack(0, "Dominant A"),
      makeTrack(1, "Dominant A"),
      makeTrack(2, "Dominant A"),
      makeTrack(3, "Dominant A"),
      makeTrack(4, "Dominant A"),
      makeTrack(5, "Dominant A"),
      makeTrack(6, "Dominant A"),
      makeTrack(7, "Artist B"),
      makeTrack(8, "Artist B"),
      makeTrack(9, "Artist C"),
    ];

    const mixed = artistSpreadMix(entries);
    expect(mixed).toHaveLength(entries.length);
    expect(new Set(mixed.map((e) => e.instanceKey))).toEqual(
      new Set(entries.map((e) => e.instanceKey))
    );
    expect(countConsecutiveSameArtist(mixed)).toBe(3);
  });

  it("runs trueShuffleMix preserving multiset and separating clumped artists", () => {
    const entries = [
      makeTrack(0, "Artist A"),
      makeTrack(1, "Artist A"),
      makeTrack(2, "Artist A"),
      makeTrack(3, "Artist B"),
      makeTrack(4, "Artist B"),
      makeTrack(5, "Artist C"),
      makeTrack(6, "Artist D"),
      makeTrack(7, "Artist E"),
    ];

    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    const shuffled = trueShuffleMix(entries, rng);
    expect(shuffled).toHaveLength(entries.length);
    expect(new Set(shuffled.map((e) => e.instanceKey))).toEqual(
      new Set(entries.map((e) => e.instanceKey))
    );
    expect(countConsecutiveSameArtist(shuffled)).toBe(0);
  });
});
