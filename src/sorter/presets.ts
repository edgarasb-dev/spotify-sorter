import type { PlaylistEntry } from "../types/spotify";
import {
  groupKindsToEdge,
  reverseEntries,
  sortEntries,
} from "./comparators";
import { artistSpreadMix, trueShuffleMix } from "./smartMix";

export type SortPresetId =
  | "added_desc"
  | "added_asc"
  | "title_asc"
  | "title_desc"
  | "artist_asc"
  | "album_asc"
  | "release_desc"
  | "release_asc"
  | "duration_asc"
  | "duration_desc"
  | "added_by_asc"
  | "explicit_first"
  | "clean_first"
  | "reverse"
  | "smart_artist_spread"
  | "smart_true_shuffle"
  | "group_non_tracks_bottom";

export type AutoSortPresetId =
  | "added_desc"
  | "added_asc"
  | "title_asc"
  | "title_desc"
  | "artist_asc"
  | "album_asc"
  | "release_desc"
  | "release_asc"
  | "duration_asc"
  | "duration_desc"
  | "added_by_asc"
  | "explicit_first"
  | "clean_first";

export const AUTO_SORT_PRESETS: Array<{ id: AutoSortPresetId; label: string }> = [
  { id: "added_desc", label: "Date Added (Newest First)" },
  { id: "added_asc", label: "Date Added (Oldest First)" },
  { id: "title_asc", label: "Title (A → Z)" },
  { id: "title_desc", label: "Title (Z → A)" },
  { id: "artist_asc", label: "Artist → Album → Track #" },
  { id: "album_asc", label: "Album → Disc # → Track #" },
  { id: "release_desc", label: "Release Date (Newest First)" },
  { id: "release_asc", label: "Release Date (Oldest First)" },
  { id: "duration_asc", label: "Duration (Shortest First)" },
  { id: "duration_desc", label: "Duration (Longest First)" },
  { id: "added_by_asc", label: "Added By (User ID)" },
  { id: "explicit_first", label: "Explicit First" },
  { id: "clean_first", label: "Clean First" },
];

export function isAutoSortPresetId(value: string): value is AutoSortPresetId {
  return AUTO_SORT_PRESETS.some((p) => p.id === value);
}

export function applySortPreset(
  entries: PlaylistEntry[],
  preset: SortPresetId
): PlaylistEntry[] {
  switch (preset) {
    case "added_desc":
      return sortEntries(entries, [{ field: "added_at", direction: "desc" }]);
    case "added_asc":
      return sortEntries(entries, [{ field: "added_at", direction: "asc" }]);
    case "title_asc":
      return sortEntries(entries, [
        { field: "title", direction: "asc", ignoreLeadingArticles: true },
      ]);
    case "title_desc":
      return sortEntries(entries, [
        { field: "title", direction: "desc", ignoreLeadingArticles: true },
      ]);
    case "artist_asc":
      return sortEntries(
        entries,
        [{ field: "artist", direction: "asc", ignoreLeadingArticles: true }],
        { keepAlbumsIntact: true }
      );
    case "album_asc":
      return sortEntries(
        entries,
        [{ field: "album", direction: "asc", ignoreLeadingArticles: true }],
        { keepAlbumsIntact: true }
      );
    case "release_desc":
      return sortEntries(entries, [{ field: "release_date", direction: "desc" }]);
    case "release_asc":
      return sortEntries(entries, [{ field: "release_date", direction: "asc" }]);
    case "duration_asc":
      return sortEntries(entries, [{ field: "duration", direction: "asc" }]);
    case "duration_desc":
      return sortEntries(entries, [{ field: "duration", direction: "desc" }]);
    case "added_by_asc":
      return sortEntries(entries, [{ field: "added_by", direction: "asc" }]);
    case "explicit_first":
      return sortEntries(entries, [{ field: "explicit", direction: "desc" }]);
    case "clean_first":
      return sortEntries(entries, [{ field: "explicit", direction: "asc" }]);
    case "reverse":
      return reverseEntries(entries);
    case "smart_artist_spread":
      return artistSpreadMix(entries);
    case "smart_true_shuffle":
      return trueShuffleMix(entries);
    case "group_non_tracks_bottom":
      return groupKindsToEdge(
        entries,
        new Set(["episode", "local", "unavailable"]),
        "bottom"
      );
  }
}
