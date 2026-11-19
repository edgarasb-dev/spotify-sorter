import type { PlaylistEntry } from "../types/spotify";

function getArtistBucketKey(entry: PlaylistEntry): string {
  const artist = entry.primaryArtist.trim().toLowerCase();
  if (!artist || entry.kind === "unavailable") {
    return `__solo::${entry.instanceKey}`;
  }
  return artist;
}

export function countConsecutiveSameArtist(entries: PlaylistEntry[]): number {
  let streaks = 0;
  for (let i = 1; i < entries.length; i++) {
    if (getArtistBucketKey(entries[i]) === getArtistBucketKey(entries[i - 1])) {
      streaks += 1;
    }
  }
  return streaks;
}

interface ArtistGroup {
  key: string;
  items: PlaylistEntry[];
  cursor: number;
}

/**
 * Evenly distributes tracks across artists so the same artist never plays twice
 * in a row whenever mathematically possible, and degrades smoothly when a single
 * artist accounts for >50% of the playlist.
 */
export function artistSpreadMix(entries: PlaylistEntry[]): PlaylistEntry[] {
  if (entries.length <= 2) return [...entries];

  const groupMap = new Map<string, ArtistGroup>();
  for (const entry of entries) {
    const key = getArtistBucketKey(entry);
    let group = groupMap.get(key);
    if (!group) {
      group = { key, items: [], cursor: 0 };
      groupMap.set(key, group);
    }
    group.items.push(entry);
  }

  const groups = Array.from(groupMap.values());
  const maxCount = groups.reduce((max, g) => Math.max(max, g.items.length), 0);
  const n = entries.length;

  // When maxCount <= ceil(N / 2), greedy picking the largest remaining group
  // different from the previous artist guarantees zero consecutive repeats.
  if (maxCount <= Math.ceil(n / 2)) {
    const result: PlaylistEntry[] = [];
    let prevKey = "";

    while (result.length < n) {
      let bestGroup: ArtistGroup | null = null;
      let bestRemaining = -1;

      for (const group of groups) {
        const remaining = group.items.length - group.cursor;
        if (remaining <= 0 || group.key === prevKey) continue;
        if (remaining > bestRemaining) {
          bestRemaining = remaining;
          bestGroup = group;
        }
      }

      if (!bestGroup) {
        // Defensive fallback (should not trigger when maxCount <= ceil(N / 2)).
        bestGroup =
          groups.find((g) => g.items.length - g.cursor > 0) ?? null;
      }
      if (!bestGroup) break;

      result.push(bestGroup.items[bestGroup.cursor]);
      bestGroup.cursor += 1;
      prevKey = bestGroup.key;
    }

    return result;
  }

  // Dominant-artist mode (>50%): space every artist's items uniformly across [0, 1]
  // so unavoidable repeats are spread evenly rather than clumped at the end.
  groups.sort((a, b) => b.items.length - a.items.length);
  const slotted: Array<{ pos: number; groupIndex: number; entry: PlaylistEntry }> = [];

  groups.forEach((group, groupIndex) => {
    const k = group.items.length;
    const phaseJitter = (groupIndex / Math.max(1, groups.length)) * 0.001;
    for (let i = 0; i < k; i++) {
      slotted.push({
        pos: (i + 0.5) / k + phaseJitter,
        groupIndex,
        entry: group.items[i],
      });
    }
  });

  slotted.sort((a, b) =>
    a.pos !== b.pos ? a.pos - b.pos : a.groupIndex - b.groupIndex
  );

  return reduceAdjacentRepeats(slotted.map((s) => s.entry));
}

function reduceAdjacentRepeats(entries: PlaylistEntry[]): PlaylistEntry[] {
  const arr = [...entries];
  const n = arr.length;
  if (n <= 2) return arr;

  for (let i = 1; i < n; i++) {
    const currKey = getArtistBucketKey(arr[i]);
    if (currKey !== getArtistBucketKey(arr[i - 1])) continue;

    // Look ahead for a swap partner that resolves this collision cleanly.
    let swapIdx = -1;
    for (let j = i + 1; j < n; j++) {
      const candidateKey = getArtistBucketKey(arr[j]);
      if (candidateKey === currKey) continue;

      const prevOfJ = getArtistBucketKey(arr[j - 1]);
      const nextOfJ = j + 1 < n ? getArtistBucketKey(arr[j + 1]) : "";
      const nextOfI = i + 1 < n ? getArtistBucketKey(arr[i + 1]) : "";

      if (
        candidateKey !== nextOfI &&
        currKey !== prevOfJ &&
        currKey !== nextOfJ
      ) {
        swapIdx = j;
        break;
      }
    }

    if (swapIdx === -1) {
      // Fallback: try looking earlier for a valid swap.
      for (let j = i - 2; j >= 0; j--) {
        const candidateKey = getArtistBucketKey(arr[j]);
        if (candidateKey === currKey) continue;

        const prevOfJ = j > 0 ? getArtistBucketKey(arr[j - 1]) : "";
        const nextOfJ = getArtistBucketKey(arr[j + 1]);
        const nextOfI = i + 1 < n ? getArtistBucketKey(arr[i + 1]) : "";

        if (
          candidateKey !== nextOfI &&
          currKey !== prevOfJ &&
          currKey !== nextOfJ
        ) {
          swapIdx = j;
          break;
        }
      }
    }

    if (swapIdx !== -1) {
      [arr[i], arr[swapIdx]] = [arr[swapIdx], arr[i]];
    }
  }

  return arr;
}

/**
 * Fisher-Yates shuffle followed by a bounded anti-clump pass to prevent
 * same-artist streaks.
 */
export function trueShuffleMix(
  entries: PlaylistEntry[],
  rng: () => number = Math.random
): PlaylistEntry[] {
  if (entries.length <= 1) return [...entries];

  const shuffled = [...entries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return reduceAdjacentRepeats(shuffled);
}
