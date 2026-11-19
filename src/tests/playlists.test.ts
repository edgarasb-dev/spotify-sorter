import { describe, expect, it } from "vitest";
import { normalizePlaylistItem, normalizeReleaseDate } from "../api/playlists";

describe("playlists normalization", () => {
  it("normalizes year, month, and day release dates", () => {
    expect(normalizeReleaseDate("2020")).toBe("2020-01-01");
    expect(normalizeReleaseDate("2020-07")).toBe("2020-07-01");
    expect(normalizeReleaseDate("2020-07-19")).toBe("2020-07-19");
    expect(normalizeReleaseDate(null)).toBe("");
    expect(normalizeReleaseDate("invalid")).toBe("");
  });

  it("normalizes 2026 /items Track, Episode, Local, and null rows keeping indices intact", () => {
    const track = normalizePlaylistItem(
      {
        added_at: "2026-03-01T10:00:00Z",
        added_by: { id: "user1" },
        is_local: false,
        item: {
          type: "track",
          id: "t1",
          uri: "spotify:track:t1",
          name: "Track One",
          duration_ms: 210000,
          explicit: true,
          disc_number: 1,
          track_number: 4,
          artists: [{ id: "a1", name: "Artist One" }],
          album: {
            name: "Album One",
            release_date: "2021",
            release_date_precision: "year",
            images: [{ url: "https://img/cover.jpg", width: 300, height: 300 }],
          },
        },
      },
      0
    );
    expect(track.kind).toBe("track");
    expect(track.instanceKey).toBe("0::spotify:track:t1");
    expect(track.releaseDateSortKey).toBe("2021-01-01");
    expect(track.explicit).toBe(true);

    const episode = normalizePlaylistItem(
      {
        added_at: null,
        added_by: { id: "friend" },
        is_local: false,
        item: {
          type: "episode",
          id: "ep1",
          uri: "spotify:episode:ep1",
          name: "Podcast Ep",
          duration_ms: 1800000,
          explicit: false,
          release_date: "2025-11",
          show: { name: "Tech Show" },
        },
      },
      1
    );
    expect(episode.kind).toBe("episode");
    expect(episode.albumOrShow).toBe("Tech Show");
    expect(episode.releaseDateSortKey).toBe("2025-11-01");
    expect(episode.addedAt).toBeNull();

    const local = normalizePlaylistItem(
      {
        added_at: "2024-01-01T00:00:00Z",
        is_local: true,
        item: {
          type: "track",
          id: null,
          uri: "spotify:local:Artist:Album:Song:180",
          name: "Local Song",
          duration_ms: 180000,
          explicit: false,
          artists: [],
        },
      },
      2
    );
    expect(local.kind).toBe("local");
    expect(local.isLocal).toBe(true);

    const unavailable = normalizePlaylistItem(
      {
        added_at: null,
        is_local: false,
        item: null,
      },
      3
    );
    expect(unavailable.kind).toBe("unavailable");
    expect(unavailable.instanceKey).toBe("3::unavailable");
  });
});
