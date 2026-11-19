import type {
  NormalizedPlaylist,
  PlaylistEntry,
  SpotifyEpisodeObject,
  SpotifyPlaylistItemRow,
  SpotifyPlaylistSummary,
  SpotifyTrackObject,
} from "../types/spotify";

export function normalizeReleaseDate(raw: string | undefined | null): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^\d{4}$/.test(trimmed)) {
    return `${trimmed}-01-01`;
  }
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return `${trimmed}-01`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  return "";
}

function isEpisode(
  item: SpotifyTrackObject | SpotifyEpisodeObject
): item is SpotifyEpisodeObject {
  return item.type === "episode";
}

export function normalizePlaylistSummary(
  raw: SpotifyPlaylistSummary,
  currentUserId: string
): NormalizedPlaylist {
  const totalItems = raw.items?.total ?? raw.tracks?.total ?? 0;
  const editable =
    raw.owner?.id === currentUserId || raw.collaborative === true;

  return {
    id: raw.id,
    name: raw.name || "Untitled Playlist",
    description: raw.description ?? "",
    imageUrl: raw.images?.[0]?.url ?? null,
    ownerId: raw.owner?.id ?? "",
    ownerDisplayName: raw.owner?.display_name ?? null,
    collaborative: Boolean(raw.collaborative),
    isPublic: raw.public,
    snapshotId: raw.snapshot_id,
    totalItems,
    editable,
  };
}

export function normalizePlaylistItem(
  row: SpotifyPlaylistItemRow,
  index: number
): PlaylistEntry {
  const media = row.item !== undefined ? row.item : (row.track ?? null);
  const addedAt = row.added_at ?? null;
  const addedById = row.added_by?.id ?? "";
  const isLocalFlag = Boolean(row.is_local);

  if (!media) {
    return {
      instanceKey: `${index}::unavailable`,
      originalIndex: index,
      kind: "unavailable",
      uri: "",
      id: null,
      title: "(Unavailable item)",
      artists: [],
      primaryArtist: "",
      albumOrShow: "",
      releaseDateRaw: null,
      releaseDateSortKey: "",
      addedAt,
      addedById,
      durationMs: 0,
      explicit: false,
      discNumber: 0,
      trackNumber: 0,
      artworkUrl: null,
      isLocal: isLocalFlag,
    };
  }

  if (isEpisode(media)) {
    const showName = media.show?.name?.trim() || "Podcast";
    const artworkUrl =
      media.images?.[media.images.length - 1]?.url ??
      media.images?.[0]?.url ??
      media.show?.images?.[media.show.images.length - 1]?.url ??
      media.show?.images?.[0]?.url ??
      null;
    const releaseDateRaw = media.release_date ?? null;
    const uri = media.uri || `spotify:episode:${media.id ?? index}`;

    return {
      instanceKey: `${index}::${uri}`,
      originalIndex: index,
      kind: "episode",
      uri,
      id: media.id ?? null,
      title: media.name || "(Untitled episode)",
      artists: [showName],
      primaryArtist: showName,
      albumOrShow: showName,
      releaseDateRaw,
      releaseDateSortKey: normalizeReleaseDate(releaseDateRaw),
      addedAt,
      addedById,
      durationMs: media.duration_ms ?? 0,
      explicit: Boolean(media.explicit),
      discNumber: 0,
      trackNumber: 0,
      artworkUrl,
      isLocal: false,
    };
  }

  const artists = (media.artists ?? [])
    .map((a) => a.name?.trim())
    .filter((name): name is string => Boolean(name));
  const primaryArtist = artists[0] ?? (isLocalFlag ? "Local Artist" : "");
  const albumOrShow = media.album?.name?.trim() ?? "";
  const releaseDateRaw = media.album?.release_date ?? null;
  const artworkUrl =
    media.album?.images?.[media.album.images.length - 1]?.url ??
    media.album?.images?.[0]?.url ??
    null;
  const uri =
    media.uri ||
    (isLocalFlag ? `spotify:local:${index}` : `spotify:track:${media.id ?? index}`);
  const isLocal = isLocalFlag || uri.startsWith("spotify:local:");

  return {
    instanceKey: `${index}::${uri}`,
    originalIndex: index,
    kind: isLocal ? "local" : "track",
    uri,
    id: media.id ?? null,
    title: media.name || "(Untitled track)",
    artists,
    primaryArtist,
    albumOrShow,
    releaseDateRaw,
    releaseDateSortKey: normalizeReleaseDate(releaseDateRaw),
    addedAt,
    addedById,
    durationMs: media.duration_ms ?? 0,
    explicit: Boolean(media.explicit),
    discNumber: media.disc_number ?? 0,
    trackNumber: media.track_number ?? 0,
    artworkUrl,
    isLocal,
  };
}
