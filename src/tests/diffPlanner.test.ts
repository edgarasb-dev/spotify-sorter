import { describe, expect, it } from "vitest";
import {
  applyMoveOp,
  applyMoves,
  planReorderMoves,
} from "../sorter/diffPlanner";

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

describe("diffPlanner", () => {
  it("returns 0 moves when current and target are empty, single-item, or already sorted", () => {
    expect(planReorderMoves([], [])).toEqual([]);
    expect(planReorderMoves(["0::a"], ["0::a"])).toEqual([]);

    const sorted = Array.from({ length: 50 }, (_, i) => `${i}::track:${i}`);
    expect(planReorderMoves(sorted, sorted)).toEqual([]);
  });

  it("moves a single item forward or backward in 1 move", () => {
    const current = ["0::a", "1::b", "2::c", "3::d", "4::e"];
    // Move index 4 to index 1
    const moveUp = ["0::a", "4::e", "1::b", "2::c", "3::d"];
    const opsUp = planReorderMoves(current, moveUp);
    expect(opsUp).toHaveLength(1);
    expect(applyMoves(current, opsUp)).toEqual(moveUp);

    // Move index 0 to end
    const moveDown = ["1::b", "2::c", "3::d", "4::e", "0::a"];
    const opsDown = planReorderMoves(current, moveDown);
    expect(opsDown).toHaveLength(1);
    expect(applyMoves(current, opsDown)).toEqual(moveDown);
  });

  it("moves a contiguous block of 20 items in 1 API move with range_length=20", () => {
    const keys = Array.from({ length: 100 }, (_, i) => `${i}::uri:${i}`);
    const block = keys.slice(40, 60);
    const rest = [...keys.slice(0, 40), ...keys.slice(60)];

    // Move block to top
    const targetTop = [...block, ...rest];
    const movesTop = planReorderMoves(keys, targetTop);
    expect(movesTop).toEqual([
      { range_start: 40, insert_before: 0, range_length: 20 },
    ]);
    expect(applyMoves(keys, movesTop)).toEqual(targetTop);

    // Move block to bottom
    const targetBottom = [...rest, ...block];
    const movesBottom = planReorderMoves(keys, targetBottom);
    expect(movesBottom).toEqual([
      { range_start: 40, insert_before: 100, range_length: 20 },
    ]);
    expect(applyMoves(keys, movesBottom)).toEqual(targetBottom);

    // Move block to index 10
    const targetMiddle = [...rest.slice(0, 10), ...block, ...rest.slice(10)];
    const movesMiddle = planReorderMoves(keys, targetMiddle);
    expect(movesMiddle).toHaveLength(1);
    expect(movesMiddle[0].range_length).toBe(20);
    expect(applyMoves(keys, movesMiddle)).toEqual(targetMiddle);
  });

  it("handles full reversal of 500 items cleanly", () => {
    const current = Array.from({ length: 500 }, (_, i) => `${i}::track:${i}`);
    const target = [...current].reverse();
    const moves = planReorderMoves(current, target);

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(500);
    expect(applyMoves(current, moves)).toEqual(target);
  });

  it("preserves exact duplicate-track identity using instanceKeys", () => {
    const current = [
      "0::spotify:track:dup",
      "1::spotify:track:other",
      "2::spotify:track:dup",
      "3::spotify:track:dup",
    ];
    const target = [
      "3::spotify:track:dup",
      "0::spotify:track:dup",
      "1::spotify:track:other",
      "2::spotify:track:dup",
    ];
    const moves = planReorderMoves(current, target);
    expect(applyMoves(current, moves)).toEqual(target);
  });

  it("produces verified move sequences for random shuffles up to 1000 items", () => {
    const rng = makeRng(20261118);
    const sizes = [0, 1, 2, 3, 10, 50, 150, 500, 1000];

    for (const size of sizes) {
      const current = Array.from({ length: size }, (_, i) => `${i}::track:${i}`);
      const target = shuffle(current, rng);
      const moves = planReorderMoves(current, target);

      for (const op of moves) {
        expect(op.range_length).toBeGreaterThanOrEqual(1);
        expect(op.range_start).toBeGreaterThanOrEqual(0);
        expect(op.range_start + op.range_length).toBeLessThanOrEqual(size);
        expect(op.insert_before).toBeGreaterThanOrEqual(0);
        expect(op.insert_before).toBeLessThanOrEqual(size);
        expect(
          op.insert_before < op.range_start ||
            op.insert_before > op.range_start + op.range_length
        ).toBe(true);
      }

      expect(applyMoves(current, moves)).toEqual(target);
    }
  });

  it("rejects mismatched keys and invalid MoveOp bounds", () => {
    expect(() => planReorderMoves(["0::a"], ["0::b"])).toThrow();
    expect(() => planReorderMoves(["0::a", "1::b"], ["0::a"])).toThrow();
    expect(() =>
      applyMoveOp(["a", "b", "c"], {
        range_start: 1,
        insert_before: 1,
        range_length: 1,
      })
    ).toThrow();
    expect(() =>
      applyMoveOp(["a", "b", "c"], {
        range_start: 1,
        insert_before: 2,
        range_length: 1,
      })
    ).toThrow();
  });
});
