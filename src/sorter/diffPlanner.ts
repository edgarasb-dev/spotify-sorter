import type { MoveOp } from "../types/spotify";

/**
 * Applies a single Spotify PUT reorder operation to an array in place-copy form.
 */
export function applyMoveOp<T>(items: readonly T[], op: MoveOp): T[] {
  const n = items.length;
  if (
    !Number.isInteger(op.range_start) ||
    !Number.isInteger(op.range_length) ||
    !Number.isInteger(op.insert_before)
  ) {
    throw new Error(`Invalid non-integer MoveOp: ${JSON.stringify(op)}`);
  }
  if (op.range_length < 1) {
    throw new Error(`MoveOp range_length must be >= 1, got ${op.range_length}`);
  }
  if (op.range_start < 0 || op.range_start + op.range_length > n) {
    throw new Error(
      `MoveOp range [${op.range_start}, ${op.range_start + op.range_length}) out of bounds for length ${n}`
    );
  }
  if (op.insert_before < 0 || op.insert_before > n) {
    throw new Error(
      `MoveOp insert_before=${op.insert_before} out of bounds for length ${n}`
    );
  }
  if (
    op.insert_before >= op.range_start &&
    op.insert_before <= op.range_start + op.range_length
  ) {
    throw new Error(
      `No-op MoveOp: insert_before=${op.insert_before} falls inside [${op.range_start}, ${op.range_start + op.range_length}]`
    );
  }

  const next = [...items];
  const moved = next.splice(op.range_start, op.range_length);
  const adjustedIndex =
    op.insert_before > op.range_start
      ? op.insert_before - op.range_length
      : op.insert_before;
  next.splice(adjustedIndex, 0, ...moved);
  return next;
}

export function applyMoves<T>(items: readonly T[], moves: readonly MoveOp[]): T[] {
  let sim = [...items];
  for (const op of moves) {
    sim = applyMoveOp(sim, op);
  }
  return sim;
}

/**
 * Computes an O(N log N) Longest Increasing Subsequence over integer target ranks.
 */
function computeLisIndices(ranks: readonly number[]): Set<number> {
  const n = ranks.length;
  if (n === 0) return new Set();

  const tailIndices: number[] = [];
  const prev = new Int32Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const x = ranks[i];
    let lo = 0;
    let hi = tailIndices.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ranks[tailIndices[mid]] < x) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    if (lo > 0) {
      prev[i] = tailIndices[lo - 1];
    }
    tailIndices[lo] = i;
  }

  const lisPositions = new Set<number>();
  let curr = tailIndices[tailIndices.length - 1];
  while (curr !== -1) {
    lisPositions.add(curr);
    curr = prev[curr];
  }
  return lisPositions;
}

/**
 * Plans a minimal sequence of Spotify PUT reorder operations that transforms
 * `currentKeys` into `targetKeys` while grouping contiguous runs (`range_length > 1`).
 */
export function planReorderMoves(
  currentKeys: readonly string[],
  targetKeys: readonly string[]
): MoveOp[] {
  const n = currentKeys.length;
  if (n !== targetKeys.length) {
    throw new Error(
      `Cannot plan reorder: length mismatch (${currentKeys.length} vs ${targetKeys.length}).`
    );
  }
  if (n <= 1) {
    if (n === 1 && currentKeys[0] !== targetKeys[0]) {
      throw new Error("Cannot plan reorder: single item key mismatch.");
    }
    return [];
  }

  const targetRank = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = targetKeys[i];
    if (targetRank.has(key)) {
      throw new Error(`Duplicate instanceKey in targetKeys: ${key}`);
    }
    targetRank.set(key, i);
  }

  const currentRanks: number[] = new Array(n);
  const seenCurrent = new Set<string>();
  for (let i = 0; i < n; i++) {
    const key = currentKeys[i];
    if (seenCurrent.has(key)) {
      throw new Error(`Duplicate instanceKey in currentKeys: ${key}`);
    }
    seenCurrent.add(key);
    const rank = targetRank.get(key);
    if (rank === undefined) {
      throw new Error(`Key present in currentKeys but missing in targetKeys: ${key}`);
    }
    currentRanks[i] = rank;
  }

  // Fast exit if already equal.
  let alreadySorted = true;
  for (let i = 0; i < n; i++) {
    if (currentRanks[i] !== i) {
      alreadySorted = false;
      break;
    }
  }
  if (alreadySorted) return [];

  const sim = [...currentKeys];
  const lisPositions = computeLisIndices(currentRanks);
  const inSpine = new Set<string>();
  for (const pos of lisPositions) {
    inSpine.add(sim[pos]);
  }

  const moves: MoveOp[] = [];

  while (inSpine.size < n) {
    // Find all maximal contiguous runs of non-spine items whose targetRanks are strictly consecutive (+1).
    let bestStart = -1;
    let bestLen = 0;

    let i = 0;
    while (i < n) {
      if (inSpine.has(sim[i])) {
        i += 1;
        continue;
      }

      const start = i;
      let prevRank = targetRank.get(sim[i])!;
      i += 1;

      while (i < n && !inSpine.has(sim[i])) {
        const nextRank = targetRank.get(sim[i])!;
        if (nextRank === prevRank + 1) {
          prevRank = nextRank;
          i += 1;
        } else {
          break;
        }
      }

      const runLen = i - start;
      if (runLen > bestLen) {
        bestLen = runLen;
        bestStart = start;
      }
    }

    if (bestStart === -1 || bestLen === 0) {
      throw new Error("Planner stalled while searching for unplaced runs.");
    }

    const minRank = targetRank.get(sim[bestStart])!;
    const maxRank = targetRank.get(sim[bestStart + bestLen - 1])!;

    // Find bounding spine indices around [minRank, maxRank].
    let prevSpineIdx = -1;
    let nextSpineIdx = n;
    for (let j = 0; j < n; j++) {
      if (!inSpine.has(sim[j])) continue;
      const r = targetRank.get(sim[j])!;
      if (r < minRank) {
        prevSpineIdx = j;
      } else if (r > maxRank) {
        nextSpineIdx = j;
        break;
      }
    }

    // If the run is already strictly between its bounding spine items, no API move needed.
    const alreadyInOrder =
      prevSpineIdx < bestStart && bestStart + bestLen <= nextSpineIdx;

    if (!alreadyInOrder) {
      let insertBefore = nextSpineIdx;

      // Prefer placing immediately after a spine item if it forms a consecutive target match,
      // or immediately after prevSpineIdx when that avoids splitting neighboring unplaced items.
      const prevRankMatch =
        prevSpineIdx >= 0 &&
        targetRank.get(sim[prevSpineIdx])! === minRank - 1;
      const nextRankMatch =
        nextSpineIdx < n &&
        targetRank.get(sim[nextSpineIdx])! === maxRank + 1;

      if (prevRankMatch && !nextRankMatch) {
        const candidate = prevSpineIdx + 1;
        if (
          candidate < bestStart ||
          candidate > bestStart + bestLen
        ) {
          insertBefore = candidate;
        }
      }

      const op: MoveOp = {
        range_start: bestStart,
        insert_before: insertBefore,
        range_length: bestLen,
      };
      moves.push(op);

      const moved = sim.splice(op.range_start, op.range_length);
      const adjusted =
        op.insert_before > op.range_start
          ? op.insert_before - op.range_length
          : op.insert_before;
      sim.splice(adjusted, 0, ...moved);

      for (const k of moved) {
        inSpine.add(k);
      }
    } else {
      for (let k = bestStart; k < bestStart + bestLen; k++) {
        inSpine.add(sim[k]);
      }
    }
  }

  // Self-check assertion: verify generated moves reproduce targetKeys identically.
  const verified = applyMoves(currentKeys, moves);
  for (let i = 0; i < n; i++) {
    if (verified[i] !== targetKeys[i]) {
      throw new Error(
        `diffPlanner verification failed at index ${i}: expected ${targetKeys[i]}, got ${verified[i]}`
      );
    }
  }

  return moves;
}
