export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyUser {
  id: string;
  display_name: string | null;
  images?: SpotifyImage[];
  uri?: string;
}

export interface SpotifyPlaylistSummary {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[] | null;
  owner: {
    id: string;
    display_name?: string | null;
    uri?: string;
  };
  collaborative: boolean;
  public: boolean | null;
  snapshot_id: string;
  items?: {
    href?: string;
    total?: number;
  };
  tracks?: {
    href?: string;
    total?: number;
  };
}

export interface SpotifyArtistRef {
  id?: string | null;
  name: string;
}

export interface SpotifyTrackObject {
  type: "track";
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  disc_number?: number;
  track_number?: number;
  artists?: SpotifyArtistRef[];
  album?: {
    name?: string;
    release_date?: string;
    release_date_precision?: "year" | "month" | "day";
    images?: SpotifyImage[];
    artists?: SpotifyArtistRef[];
  };
  external_ids?: {
    isrc?: string;
  };
}

export interface SpotifyEpisodeObject {
  type: "episode";
  id: string | null;
  uri: string;
  name: string;
  duration_ms: number;
  explicit: boolean;
  release_date?: string;
  release_date_precision?: "year" | "month" | "day";
  images?: SpotifyImage[];
  show?: {
    name?: string;
    publisher?: string;
    images?: SpotifyImage[];
  };
}

export interface SpotifyPlaylistItemRow {
  added_at: string | null;
  added_by?: {
    id?: string | null;
    uri?: string;
  } | null;
  is_local?: boolean;
  item?: SpotifyTrackObject | SpotifyEpisodeObject | null;
  track?: SpotifyTrackObject | SpotifyEpisodeObject | null;
}

export interface SpotifyPagingResponse<T> {
  href: string;
  items: T[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
}

export interface NormalizedPlaylist {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  ownerId: string;
  ownerDisplayName: string | null;
  collaborative: boolean;
  isPublic: boolean | null;
  snapshotId: string;
  totalItems: number;
  editable: boolean;
}

export type PlaylistEntryKind = "track" | "episode" | "local" | "unavailable";

export interface PlaylistEntry {
  instanceKey: string;
  originalIndex: number;
  kind: PlaylistEntryKind;
  uri: string;
  id: string | null;
  title: string;
  artists: string[];
  primaryArtist: string;
  albumOrShow: string;
  releaseDateRaw: string | null;
  releaseDateSortKey: string;
  addedAt: string | null;
  addedById: string;
  durationMs: number;
  explicit: boolean;
  discNumber: number;
  trackNumber: number;
  artworkUrl: string | null;
  isLocal: boolean;
}

export interface MoveOp {
  range_start: number;
  insert_before: number;
  range_length: number;
}

export type SortDirection = "asc" | "desc";

export type SortField =
  | "added_at"
  | "title"
  | "artist"
  | "album"
  | "release_date"
  | "duration"
  | "added_by"
  | "explicit";

export interface SortRule {
  field: SortField;
  direction: SortDirection;
  ignoreLeadingArticles?: boolean;
}

export interface BackupEntryRef {
  uri: string;
  occurrenceIndex: number;
  title: string;
  artist: string;
  kind: PlaylistEntryKind;
}

export interface BackupSnapshot {
  id: string;
  playlistId: string;
  playlistName: string;
  createdAt: string;
  snapshotId: string;
  itemCount: number;
  reason: "auto_pre_commit" | "manual_export" | "auto_vps";
  entries: BackupEntryRef[];
}

export interface AutoSortPlaylistRule {
  playlistId: string;
  playlistName: string;
  preset: string;
  enabled: boolean;
  lastSnapshotId: string | null;
  lastCheckedAt: string | null;
  lastSortedAt: string | null;
  lastMovesCount: number;
  lastError: string | null;
}

export interface AutoSortStatusResponse {
  available: boolean;
  authConnected: boolean;
  authStatus: "connected" | "needs_reauth" | "disconnected";
  userId: string | null;
  pollIntervalSeconds: number;
  isSyncing: boolean;
  lastTickAt: string | null;
  lastTickError: string | null;
  rules: AutoSortPlaylistRule[];
}
