import type {
  PlaylistEntry,
  PlaylistEntryKind,
  SortDirection,
  SortRule,
} from "../types/spotify";

const LEADING_ARTICLE_RE = /^(?:the|a|an)\s+/i;

export function stripLeadingArticles(text: string): string {
  const stripped = text.trim().replace(LEADING_ARTICLE_RE, "");
  return stripped.length > 0 ? stripped : text.trim();
}

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    sensitivity: "base",
    numeric: true,
  });
}

function compareOptionalStrings(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: SortDirection
): number {
  const cleanA = (a ?? "").trim();
  const cleanB = (b ?? "").trim();
  if (!cleanA && !cleanB) return 0;
  // Always sink missing values to the bottom regardless of asc/desc.
  if (!cleanA) return 1;
  if (!cleanB) return -1;
  const cmp = compareStrings(cleanA, cleanB);
  return direction === "asc" ? cmp : -cmp;
}

function compareOptionalTimestamps(
  a: string | null,
  b: string | null,
  direction: SortDirection
): number {
  const tsA = a ? Date.parse(a) : Number.NaN;
  const tsB = b ? Date.parse(b) : Number.NaN;
  const validA = Number.isFinite(tsA);
  const validB = Number.isFinite(tsB);
  if (!validA && !validB) return 0;
  if (!validA) return 1;
  if (!validB) return -1;
  if (tsA === tsB) return 0;
  const cmp = tsA < tsB ? -1 : 1;
  return direction === "asc" ? cmp : -cmp;
}

function compareRule(a: PlaylistEntry, b: PlaylistEntry, rule: SortRule): number {
  // Always keep unavailable items at the bottom during metadata sorts.
  if (a.kind === "unavailable" && b.kind !== "unavailable") return 1;
  if (b.kind === "unavailable" && a.kind !== "unavailable") return -1;

  const dir = rule.direction;

  switch (rule.field) {
    case "added_at":
      return compareOptionalTimestamps(a.addedAt, b.addedAt, dir);

    case "title": {
      const titleA = rule.ignoreLeadingArticles
        ? stripLeadingArticles(a.title)
        : a.title;
      const titleB = rule.ignoreLeadingArticles
        ? stripLeadingArticles(b.title)
        : b.title;
      return compareOptionalStrings(titleA, titleB, dir);
    }

    case "artist": {
      const artistA = rule.ignoreLeadingArticles
        ? stripLeadingArticles(a.primaryArtist)
        : a.primaryArtist;
      const artistB = rule.ignoreLeadingArticles
        ? stripLeadingArticles(b.primaryArtist)
        : b.primaryArtist;
      return compareOptionalStrings(artistA, artistB, dir);
    }

    case "album": {
      const albumA = rule.ignoreLeadingArticles
        ? stripLeadingArticles(a.albumOrShow)
        : a.albumOrShow;
      const albumB = rule.ignoreLeadingArticles
        ? stripLeadingArticles(b.albumOrShow)
        : b.albumOrShow;
      return compareOptionalStrings(albumA, albumB, dir);
    }

    case "release_date":
      return compareOptionalStrings(
        a.releaseDateSortKey,
        b.releaseDateSortKey,
        dir
      );

    case "duration": {
      if (a.durationMs === b.durationMs) return 0;
      const cmp = a.durationMs < b.durationMs ? -1 : 1;
      return dir === "asc" ? cmp : -cmp;
    }

    case "added_by":
      return compareOptionalStrings(a.addedById, b.addedById, dir);

    case "explicit": {
      if (a.explicit === b.explicit) return 0;
      // "asc" = Clean First, "desc" = Explicit First
      const cmp = a.explicit ? 1 : -1;
      return dir === "asc" ? cmp : -cmp;
    }
  }
}

export interface SortOptions {
  keepAlbumsIntact?: boolean;
}

export function sortEntries(
  entries: PlaylistEntry[],
  rules: SortRule[],
  options: SortOptions = {}
): PlaylistEntry[] {
  if (entries.length <= 1 || rules.length === 0) {
    return [...entries];
  }

  const hasAlbumOrArtistRule = rules.some(
    (r) => r.field === "album" || r.field === "artist"
  );
  const keepAlbumsIntact = options.keepAlbumsIntact ?? hasAlbumOrArtistRule;

  return [...entries].sort((a, b) => {
    for (const rule of rules) {
      const cmp = compareRule(a, b, rule);
      if (cmp !== 0) return cmp;
    }

    if (keepAlbumsIntact && a.kind !== "unavailable" && b.kind !== "unavailable") {
      const albumCmp = compareOptionalStrings(a.albumOrShow, b.albumOrShow, "asc");
      if (albumCmp !== 0) return albumCmp;

      if (a.discNumber !== b.discNumber) {
        return a.discNumber - b.discNumber;
      }
      if (a.trackNumber !== b.trackNumber) {
        return a.trackNumber - b.trackNumber;
      }
    }

    return a.originalIndex - b.originalIndex;
  });
}

export function reverseEntries(entries: PlaylistEntry[]): PlaylistEntry[] {
  return [...entries].reverse();
}

export function moveSelectionToEdge(
  entries: PlaylistEntry[],
  selectedKeys: ReadonlySet<string>,
  edge: "top" | "bottom"
): PlaylistEntry[] {
  if (selectedKeys.size === 0) return [...entries];
  const selected: PlaylistEntry[] = [];
  const rest: PlaylistEntry[] = [];
  for (const entry of entries) {
    if (selectedKeys.has(entry.instanceKey)) {
      selected.push(entry);
    } else {
      rest.push(entry);
    }
  }
  return edge === "top" ? [...selected, ...rest] : [...rest, ...selected];
}

export function moveSelectionToPosition(
  entries: PlaylistEntry[],
  selectedKeys: ReadonlySet<string>,
  oneBasedPosition: number
): PlaylistEntry[] {
  if (selectedKeys.size === 0) return [...entries];
  const selected: PlaylistEntry[] = [];
  const rest: PlaylistEntry[] = [];
  for (const entry of entries) {
    if (selectedKeys.has(entry.instanceKey)) {
      selected.push(entry);
    } else {
      rest.push(entry);
    }
  }
  const clampedIndex = Math.max(
    0,
    Math.min(rest.length, Math.floor(oneBasedPosition) - 1)
  );
  const next = [...rest];
  next.splice(clampedIndex, 0, ...selected);
  return next;
}

export function moveSelectionStep(
  entries: PlaylistEntry[],
  selectedKeys: ReadonlySet<string>,
  direction: "up" | "down"
): PlaylistEntry[] {
  if (selectedKeys.size === 0 || entries.length <= 1) return [...entries];
  const next = [...entries];

  if (direction === "up") {
    for (let i = 1; i < next.length; i++) {
      if (
        selectedKeys.has(next[i].instanceKey) &&
        !selectedKeys.has(next[i - 1].instanceKey)
      ) {
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
      }
    }
  } else {
    for (let i = next.length - 2; i >= 0; i--) {
      if (
        selectedKeys.has(next[i].instanceKey) &&
        !selectedKeys.has(next[i + 1].instanceKey)
      ) {
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
      }
    }
  }

  return next;
}

export function swapTwoEntries(
  entries: PlaylistEntry[],
  keyA: string,
  keyB: string
): PlaylistEntry[] {
  if (keyA === keyB) return [...entries];
  const idxA = entries.findIndex((e) => e.instanceKey === keyA);
  const idxB = entries.findIndex((e) => e.instanceKey === keyB);
  if (idxA === -1 || idxB === -1) return [...entries];
  const next = [...entries];
  [next[idxA], next[idxB]] = [next[idxB], next[idxA]];
  return next;
}

export function groupKindsToEdge(
  entries: PlaylistEntry[],
  kinds: ReadonlySet<PlaylistEntryKind>,
  edge: "top" | "bottom"
): PlaylistEntry[] {
  const matched: PlaylistEntry[] = [];
  const rest: PlaylistEntry[] = [];
  for (const entry of entries) {
    if (kinds.has(entry.kind)) {
      matched.push(entry);
    } else {
      rest.push(entry);
    }
  }
  return edge === "top" ? [...matched, ...rest] : [...rest, ...matched];
}
