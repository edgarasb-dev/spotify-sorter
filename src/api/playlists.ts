import type {
  NormalizedPlaylist,
  PlaylistEntry,
  SpotifyPagingResponse,
  SpotifyPlaylistItemRow,
  SpotifyPlaylistSummary,
} from "../types/spotify";
import {
  normalizePlaylistItem,
  normalizePlaylistSummary,
  normalizeReleaseDate,
} from "./playlistNormalizer";
import { spotifyFetch } from "./spotifyClient";

export { normalizePlaylistItem, normalizePlaylistSummary, normalizeReleaseDate };

export async function fetchAllPlaylists(
  currentUserId: string
): Promise<NormalizedPlaylist[]> {
  const playlists: NormalizedPlaylist[] = [];
  let nextUrl: string | null = "/me/playlists?limit=50&offset=0";

  while (nextUrl) {
    const page: SpotifyPagingResponse<SpotifyPlaylistSummary> =
      await spotifyFetch<SpotifyPagingResponse<SpotifyPlaylistSummary>>(nextUrl);

    for (const raw of page.items) {
      playlists.push(normalizePlaylistSummary(raw, currentUserId));
    }

    nextUrl = page.next;
  }

  return playlists;
}

export async function fetchSnapshotId(playlistId: string): Promise<string> {
  const res = await spotifyFetch<{ snapshot_id: string }>(
    `/playlists/${encodeURIComponent(playlistId)}?fields=snapshot_id`
  );
  return res.snapshot_id;
}

export async function fetchAllPlaylistItems(
  playlistId: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<{ items: PlaylistEntry[]; total: number; snapshotId: string }> {
  const encodedId = encodeURIComponent(playlistId);
  const items: PlaylistEntry[] = [];
  let nextUrl: string | null =
    `/playlists/${encodedId}/items?limit=50&offset=0&additional_types=track,episode`;
  let total = 0;

  while (nextUrl) {
    const page: SpotifyPagingResponse<SpotifyPlaylistItemRow> =
      await spotifyFetch<SpotifyPagingResponse<SpotifyPlaylistItemRow>>(nextUrl);

    total = page.total;
    for (const row of page.items) {
      items.push(normalizePlaylistItem(row, items.length));
    }
    onProgress?.(items.length, total);
    nextUrl = page.next;
  }

  const snapshotId = await fetchSnapshotId(playlistId);
  return { items, total, snapshotId };
}
