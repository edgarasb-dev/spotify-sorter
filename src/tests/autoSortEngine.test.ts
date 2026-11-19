import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AutoSortEngine } from "../../server/autoSortEngine";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spotify-sorter-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("AutoSortEngine", () => {
  it("skips item fetch and PUT when snapshot_id is unchanged, and moves new songs to top with backup when changed", async () => {
    const dir = makeTempDir();
    let liveSnap = "snap-initial";
    let itemsOrder = [
      { id: "t2", added_at: "2026-11-18T10:00:00Z" },
      { id: "t1", added_at: "2026-11-17T10:00:00Z" },
      { id: "t3", added_at: "2026-11-19T12:00:00Z" }, // newly added at bottom
    ];
    const putPayloads: Array<Record<string, unknown>> = [];
    let itemFetches = 0;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/v1/me/playlists")) {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: "pl123",
                name: "My Fresh Playlist",
                description: "",
                images: [],
                owner: { id: "user1" },
                collaborative: false,
                public: false,
                snapshot_id: liveSnap,
                items: { total: itemsOrder.length },
              },
            ],
            next: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/v1/playlists/pl123?fields=snapshot_id")) {
        return new Response(JSON.stringify({ snapshot_id: liveSnap }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.includes("/v1/playlists/pl123/items") && (init?.method ?? "GET") === "GET") {
        itemFetches += 1;
        return new Response(
          JSON.stringify({
            total: itemsOrder.length,
            next: null,
            items: itemsOrder.map((t) => ({
              added_at: t.added_at,
              added_by: { id: "user1" },
              is_local: false,
              item: {
                type: "track",
                id: t.id,
                uri: `spotify:track:${t.id}`,
                name: `Track ${t.id}`,
                duration_ms: 180000,
                explicit: false,
                artists: [{ id: "a1", name: "Artist" }],
                album: { name: "Album", release_date: "2025-01-01" },
              },
            })),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/v1/playlists/pl123/items") && init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        putPayloads.push(body);
        const start = body.range_start as number;
        const len = body.range_length as number;
        const before = body.insert_before as number;
        const moved = itemsOrder.splice(start, len);
        const dest = before > start ? before - len : before;
        itemsOrder.splice(dest, 0, ...moved);
        liveSnap = "snap-after-sort";
        return new Response(JSON.stringify({ snapshot_id: liveSnap }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response("Not Found", { status: 404 });
    };

    const engine = new AutoSortEngine({
      dataDir: dir,
      fetchImpl: mockFetch,
      stepDelayMs: 0,
    });

    engine.saveAuth({
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: Date.now() + 3600_000,
      clientId: "cid",
      userId: "user1",
    });

    engine.upsertRule({
      playlistId: "pl123",
      playlistName: "My Fresh Playlist",
      preset: "added_desc",
      enabled: true,
    });

    // Tick 1: sorts newest track t3 from index 2 -> index 0 in 1 PUT call
    const status1 = await engine.runTick();
    expect(status1.rules[0].lastMovesCount).toBe(1);
    expect(status1.rules[0].lastSnapshotId).toBe("snap-after-sort");
    expect(putPayloads).toEqual([
      {
        range_start: 2,
        insert_before: 0,
        range_length: 1,
        snapshot_id: "snap-initial",
      },
    ]);
    expect(itemsOrder.map((t) => t.id)).toEqual(["t3", "t2", "t1"]);

    // Verify pre-sort backup was written before mutating Spotify
    const backups = engine.listBackups("pl123");
    expect(backups).toHaveLength(1);
    expect(backups[0].reason).toBe("auto_vps");
    expect(backups[0].snapshotId).toBe("snap-initial");
    expect(backups[0].entries.map((e) => e.uri)).toEqual([
      "spotify:track:t2",
      "spotify:track:t1",
      "spotify:track:t3",
    ]);

    // Tick 2: snapshot_id matches -> 0 item fetches and 0 PUTs
    const fetchesAfterTick1 = itemFetches;
    await engine.runTick();
    expect(itemFetches).toBe(fetchesAfterTick1);
    expect(putPayloads).toHaveLength(1);
  });

  it("marks auth needs_reauth on 400 invalid_grant refresh and rejects invalid playlist IDs", async () => {
    const dir = makeTempDir();
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });

    const engine = new AutoSortEngine({ dataDir: dir, fetchImpl: mockFetch });
    engine.saveAuth({
      accessToken: "expired",
      refreshToken: "dead-ref",
      expiresAt: Date.now() - 10_000,
      clientId: "cid",
      userId: "user1",
    });
    engine.upsertRule({
      playlistId: "pl123",
      playlistName: "Test",
      preset: "added_desc",
      enabled: true,
    });

    const status = await engine.runTick();
    expect(status.authConnected).toBe(false);
    expect(status.authStatus).toBe("needs_reauth");
    expect(() => engine.listBackups("../etc/passwd")).toThrow();
  });
});
