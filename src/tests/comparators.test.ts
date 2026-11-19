import { describe, expect, it } from "vitest";
import type { PlaylistEntry } from "../types/spotify";
import {
  groupKindsToEdge,
  moveSelectionStep,
  moveSelectionToEdge,
  moveSelectionToPosition,
  reverseEntries,
  sortEntries,
  stripLeadingArticles,
  swapTwoEntries,
} from "../sorter/comparators";

function makeEntry(
  idx: number,
  overrides: Partial<PlaylistEntry> = {}
): PlaylistEntry {
  return {
    instanceKey: `${idx}::spotify:track:${idx}`,
    originalIndex: idx,
    kind: "track",
    uri: `spotify:track:${idx}`,
    id: `${idx}`,
    title: `Track ${idx}`,
    artists: [`Artist ${idx}`],
    primaryArtist: `Artist ${idx}`,
    albumOrShow: `Album ${idx}`,
    releaseDateRaw: "2022-05-01",
    releaseDateSortKey: "2022-05-01",
    addedAt: "2025-01-01T00:00:00Z",
    addedById: "user1",
    durationMs: 180000,
    explicit: false,
    discNumber: 1,
    trackNumber: 1,
    artworkUrl: null,
    isLocal: false,
    ...overrides,
  };
}

describe("comparators", () => {
  it("strips leading English articles only at word boundaries", () => {
    expect(stripLeadingArticles("The Strokes")).toBe("Strokes");
    expect(stripLeadingArticles("A Day in the Life")).toBe("Day in the Life");
    expect(stripLeadingArticles("An End")).toBe("End");
    expect(stripLeadingArticles("They Might Be Giants")).toBe("They Might Be Giants");
  });

  it("sorts titles ignoring articles when configured and sinks unavailable items", () => {
    const entries = [
      makeEntry(0, { title: "The Zebra" }),
      makeEntry(1, { kind: "unavailable", uri: "", title: "(Unavailable item)" }),
      makeEntry(2, { title: "Alpha" }),
      makeEntry(3, { title: "A Beta" }),
    ];

    const sorted = sortEntries(entries, [
      { field: "title", direction: "asc", ignoreLeadingArticles: true },
    ]);

    expect(sorted.map((e) => e.originalIndex)).toEqual([2, 3, 0, 1]);
  });

  it("keeps albums intact with discNumber + trackNumber tie-breaking", () => {
    const entries = [
      makeEntry(0, { albumOrShow: "Record", discNumber: 2, trackNumber: 1 }),
      makeEntry(1, { albumOrShow: "Record", discNumber: 1, trackNumber: 3 }),
      makeEntry(2, { albumOrShow: "Record", discNumber: 1, trackNumber: 1 }),
      makeEntry(3, { albumOrShow: "Another", discNumber: 1, trackNumber: 1 }),
    ];

    const sorted = sortEntries(entries, [{ field: "album", direction: "asc" }]);
    expect(sorted.map((e) => e.originalIndex)).toEqual([3, 2, 1, 0]);
  });

  it("sinks null addedAt and empty release dates to bottom in both asc and desc", () => {
    const entries = [
      makeEntry(0, { addedAt: null, releaseDateSortKey: "" }),
      makeEntry(1, { addedAt: "2024-01-01T00:00:00Z", releaseDateSortKey: "2020-01-01" }),
      makeEntry(2, { addedAt: "2025-06-01T00:00:00Z", releaseDateSortKey: "2024-03-01" }),
    ];

    const byAddedDesc = sortEntries(entries, [{ field: "added_at", direction: "desc" }]);
    expect(byAddedDesc.map((e) => e.originalIndex)).toEqual([2, 1, 0]);

    const byAddedAsc = sortEntries(entries, [{ field: "added_at", direction: "asc" }]);
    expect(byAddedAsc.map((e) => e.originalIndex)).toEqual([1, 2, 0]);

    const byReleaseDesc = sortEntries(entries, [{ field: "release_date", direction: "desc" }]);
    expect(byReleaseDesc.map((e) => e.originalIndex)).toEqual([2, 1, 0]);
  });

  it("supports multi-rule sorting, explicit ordering, added_by, and duration", () => {
    const entries = [
      makeEntry(0, { addedById: "bob", explicit: false, durationMs: 200000 }),
      makeEntry(1, { addedById: "alice", explicit: true, durationMs: 120000 }),
      makeEntry(2, { addedById: "alice", explicit: false, durationMs: 300000 }),
    ];

    const explicitFirst = sortEntries(entries, [
      { field: "added_by", direction: "asc" },
      { field: "explicit", direction: "desc" },
    ]);
    expect(explicitFirst.map((e) => e.originalIndex)).toEqual([1, 2, 0]);

    const byDuration = sortEntries(entries, [{ field: "duration", direction: "desc" }]);
    expect(byDuration.map((e) => e.originalIndex)).toEqual([2, 0, 1]);
  });

  it("executes reverse, bulk move, step move, swap, and kind grouping", () => {
    const entries = [
      makeEntry(0, { kind: "track" }),
      makeEntry(1, { kind: "episode" }),
      makeEntry(2, { kind: "local", isLocal: true }),
      makeEntry(3, { kind: "track" }),
    ];

    expect(reverseEntries(entries).map((e) => e.originalIndex)).toEqual([3, 2, 1, 0]);

    const selected = new Set([entries[1].instanceKey, entries[3].instanceKey]);
    expect(
      moveSelectionToEdge(entries, selected, "top").map((e) => e.originalIndex)
    ).toEqual([1, 3, 0, 2]);
    expect(
      moveSelectionToEdge(entries, selected, "bottom").map((e) => e.originalIndex)
    ).toEqual([0, 2, 1, 3]);
    expect(
      moveSelectionToPosition(entries, selected, 2).map((e) => e.originalIndex)
    ).toEqual([0, 1, 3, 2]);

    expect(
      moveSelectionStep(entries, new Set([entries[2].instanceKey]), "up").map(
        (e) => e.originalIndex
      )
    ).toEqual([0, 2, 1, 3]);

    expect(
      swapTwoEntries(entries, entries[0].instanceKey, entries[3].instanceKey).map(
        (e) => e.originalIndex
      )
    ).toEqual([3, 1, 2, 0]);

    expect(
      groupKindsToEdge(entries, new Set(["episode", "local"]), "bottom").map(
        (e) => e.originalIndex
      )
    ).toEqual([0, 3, 1, 2]);
  });
});
