import fs from "node:fs";
import path from "node:path";
import { normalizePlaylistItem, normalizePlaylistSummary } from "../src/api/playlistNormalizer";
import { planReorderMoves } from "../src/sorter/diffPlanner";
import {
  applySortPreset,
  isAutoSortPresetId,
  type AutoSortPresetId,
} from "../src/sorter/presets";
import { createBackupSnapshot } from "../src/storage/backupCore";
import type {
  AutoSortPlaylistRule,
  AutoSortStatusResponse,
  BackupSnapshot,
  PlaylistEntry,
  SpotifyPagingResponse,
  SpotifyPlaylistItemRow,
  SpotifyPlaylistSummary,
} from "../src/types/spotify";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const MAX_VPS_BACKUPS_PER_PLAYLIST = 20;
const PLAYLIST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface ServerAuthRecord {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  clientId: string;
  userId: string;
  status: "connected" | "needs_reauth";
}

export interface ServerStateFile {
  auth: ServerAuthRecord | null;
  lastTickAt: string | null;
  lastTickError: string | null;
  rules: Record<string, AutoSortPlaylistRule>;
}

export class NeedsReauthError extends Error {
  constructor(message = "Spotify session expired or revoked. Please sign in again.") {
    super(message);
    this.name = "NeedsReauthError";
  }
}

export function validatePlaylistId(playlistId: string): string {
  if (!PLAYLIST_ID_RE.test(playlistId)) {
    throw new Error("Invalid playlist ID.");
  }
  return playlistId;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export class AutoSortEngine {
  readonly dataDir: string;
  readonly statePath: string;
  readonly backupsDir: string;
  readonly pollIntervalSeconds: number;
  private readonly fetchImpl: typeof fetch;
  private readonly stepDelayMs: number;
  private refreshPromise: Promise<string> | null = null;
  private tickPromise: Promise<AutoSortStatusResponse> | null = null;

  constructor(options: {
    dataDir: string;
    pollIntervalSeconds?: number;
    fetchImpl?: typeof fetch;
    stepDelayMs?: number;
  }) {
    this.dataDir = path.resolve(options.dataDir);
    this.statePath = path.join(this.dataDir, "state.json");
    this.backupsDir = path.join(this.dataDir, "backups");
    this.pollIntervalSeconds = options.pollIntervalSeconds ?? 120;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.stepDelayMs = options.stepDelayMs ?? 150;
  }

  readState(): ServerStateFile {
    try {
      if (!fs.existsSync(this.statePath)) {
        return { auth: null, lastTickAt: null, lastTickError: null, rules: {} };
      }
      const raw = fs.readFileSync(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ServerStateFile>;
      return {
        auth: parsed.auth ?? null,
        lastTickAt: parsed.lastTickAt ?? null,
        lastTickError: parsed.lastTickError ?? null,
        rules: parsed.rules && typeof parsed.rules === "object" ? parsed.rules : {},
      };
    } catch {
      return { auth: null, lastTickAt: null, lastTickError: null, rules: {} };
    }
  }

  private writeState(state: ServerStateFile): void {
    atomicWriteJson(this.statePath, state);
  }

  getStatus(): AutoSortStatusResponse {
    const state = this.readState();
    const authStatus = !state.auth
      ? "disconnected"
      : state.auth.status === "connected"
        ? "connected"
        : "needs_reauth";

    return {
      available: true,
      authConnected: authStatus === "connected",
      authStatus,
      userId: state.auth?.userId ?? null,
      pollIntervalSeconds: this.pollIntervalSeconds,
      isSyncing: this.tickPromise !== null,
      lastTickAt: state.lastTickAt,
      lastTickError: state.lastTickError,
      rules: Object.values(state.rules),
    };
  }

  saveAuth(input: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    clientId: string;
    userId: string;
  }): AutoSortStatusResponse {
    const state = this.readState();
    state.auth = {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
      clientId: input.clientId,
      userId: input.userId,
      status: "connected",
    };
    state.lastTickError = null;
    this.writeState(state);
    return this.getStatus();
  }

  clearAuth(): AutoSortStatusResponse {
    const state = this.readState();
    state.auth = null;
    this.writeState(state);
    return this.getStatus();
  }

  upsertRule(input: {
    playlistId: string;
    playlistName: string;
    preset: string;
    enabled: boolean;
  }): AutoSortPlaylistRule {
    const playlistId = validatePlaylistId(input.playlistId);
    if (!isAutoSortPresetId(input.preset)) {
      throw new Error(`Unsupported auto-sort preset: ${input.preset}`);
    }

    const state = this.readState();
    const existing = state.rules[playlistId];
    const presetChanged = existing && existing.preset !== input.preset;

    const rule: AutoSortPlaylistRule = {
      playlistId,
      playlistName: input.playlistName || existing?.playlistName || "Playlist",
      preset: input.preset,
      enabled: input.enabled,
      lastSnapshotId: presetChanged ? null : (existing?.lastSnapshotId ?? null),
      lastCheckedAt: existing?.lastCheckedAt ?? null,
      lastSortedAt: existing?.lastSortedAt ?? null,
      lastMovesCount: existing?.lastMovesCount ?? 0,
      lastError: input.enabled ? null : (existing?.lastError ?? null),
    };

    state.rules[playlistId] = rule;
    this.writeState(state);
    return rule;
  }

  deleteRule(playlistId: string): void {
    const id = validatePlaylistId(playlistId);
    const state = this.readState();
    delete state.rules[id];
    this.writeState(state);
  }

  listBackups(playlistId: string): BackupSnapshot[] {
    const id = validatePlaylistId(playlistId);
    const filePath = path.join(this.backupsDir, `${id}.json`);
    try {
      if (!fs.existsSync(filePath)) return [];
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
      return Array.isArray(parsed) ? (parsed as BackupSnapshot[]) : [];
    } catch {
      return [];
    }
  }

  saveBackup(snapshot: BackupSnapshot): BackupSnapshot[] {
    const id = validatePlaylistId(snapshot.playlistId);
    const existing = this.listBackups(id);
    const next = [snapshot, ...existing].slice(0, MAX_VPS_BACKUPS_PER_PLAYLIST);
    atomicWriteJson(path.join(this.backupsDir, `${id}.json`), next);
    return next;
  }

  deleteBackup(playlistId: string, backupId: string): BackupSnapshot[] {
    const id = validatePlaylistId(playlistId);
    const next = this.listBackups(id).filter((b) => b.id !== backupId);
    atomicWriteJson(path.join(this.backupsDir, `${id}.json`), next);
    return next;
  }

  async getValidAccessToken(forceRefresh = false): Promise<{
    accessToken: string;
    expiresAt: number;
  }> {
    const state = this.readState();
    if (!state.auth || state.auth.status !== "connected") {
      throw new NeedsReauthError();
    }

    if (!forceRefresh && Date.now() < state.auth.expiresAt - 60_000) {
      return {
        accessToken: state.auth.accessToken,
        expiresAt: state.auth.expiresAt,
      };
    }

    if (this.refreshPromise) {
      const accessToken = await this.refreshPromise;
      const latest = this.readState();
      return {
        accessToken,
        expiresAt: latest.auth?.expiresAt ?? Date.now() + 3600_000,
      };
    }

    this.refreshPromise = (async () => {
      const currentState = this.readState();
      const auth = currentState.auth;
      if (!auth || auth.status !== "connected" || !auth.refreshToken) {
        throw new NeedsReauthError();
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: auth.refreshToken,
        client_id: auth.clientId,
      });

      const res = await this.fetchImpl(SPOTIFY_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        if (res.status === 400 || res.status === 401) {
          currentState.auth = { ...auth, status: "needs_reauth" };
          currentState.lastTickError =
            "Spotify refresh token expired or revoked. Sign in again to re-sync.";
          this.writeState(currentState);
          throw new NeedsReauthError(currentState.lastTickError);
        }
        throw new Error(`Spotify token refresh failed (${res.status}): ${text}`);
      }

      const tokenJson = (await res.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
      };

      currentState.auth = {
        ...auth,
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token ?? auth.refreshToken,
        expiresAt: Date.now() + tokenJson.expires_in * 1000,
        status: "connected",
      };
      this.writeState(currentState);
      return tokenJson.access_token;
    })();

    try {
      const accessToken = await this.refreshPromise;
      const latest = this.readState();
      return {
        accessToken,
        expiresAt: latest.auth?.expiresAt ?? Date.now() + 3600_000,
      };
    } finally {
      this.refreshPromise = null;
    }
  }

  private async spotifyFetch<T>(
    pathOrUrl: string,
    options: { method?: "GET" | "PUT"; body?: unknown } = {}
  ): Promise<T> {
    const url = pathOrUrl.startsWith("https://api.spotify.com/")
      ? pathOrUrl
      : `${SPOTIFY_API_BASE}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;

    let refreshed = false;
    let rateRetries = 0;

    while (true) {
      const { accessToken } = await this.getValidAccessToken(false);
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
      };
      let serializedBody: string | undefined;
      if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
        serializedBody = JSON.stringify(options.body);
      }

      const res = await this.fetchImpl(url, {
        method: options.method ?? "GET",
        headers,
        body: serializedBody,
      });

      if (res.status === 401 && !refreshed) {
        refreshed = true;
        await this.getValidAccessToken(true);
        continue;
      }

      if (res.status === 429) {
        const retryHeader = res.headers.get("Retry-After");
        const parsed = retryHeader ? Number.parseInt(retryHeader, 10) : NaN;
        const waitSeconds = Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
        if (rateRetries >= 4) {
          throw new Error(`Spotify rate limit (429) exceeded after 4 retries.`);
        }
        rateRetries += 1;
        await sleep((waitSeconds + 0.25) * 1000);
        continue;
      }

      if (!res.ok) {
        const msg = await res.text().catch(() => res.statusText);
        const err = new Error(`Spotify API ${res.status}: ${msg}`) as Error & {
          status?: number;
        };
        err.status = res.status;
        throw err;
      }

      return (await res.json()) as T;
    }
  }

  private async fetchPlaylistSummaryMap(
    userId: string
  ): Promise<Map<string, ReturnType<typeof normalizePlaylistSummary>>> {
    const map = new Map<string, ReturnType<typeof normalizePlaylistSummary>>();
    let nextUrl: string | null = "/me/playlists?limit=50&offset=0";

    while (nextUrl) {
      const page: SpotifyPagingResponse<SpotifyPlaylistSummary> =
        await this.spotifyFetch<SpotifyPagingResponse<SpotifyPlaylistSummary>>(
          nextUrl
        );
      for (const raw of page.items) {
        const normalized = normalizePlaylistSummary(raw, userId);
        map.set(normalized.id, normalized);
      }
      nextUrl = page.next;
    }

    return map;
  }

  private async fetchAllItems(
    playlistId: string
  ): Promise<{ items: PlaylistEntry[]; total: number }> {
    const encodedId = encodeURIComponent(playlistId);
    const items: PlaylistEntry[] = [];
    let nextUrl: string | null =
      `/playlists/${encodedId}/items?limit=50&offset=0&additional_types=track,episode`;
    let total = 0;

    while (nextUrl) {
      const page: SpotifyPagingResponse<SpotifyPlaylistItemRow> =
        await this.spotifyFetch<SpotifyPagingResponse<SpotifyPlaylistItemRow>>(
          nextUrl
        );
      total = page.total;
      for (const row of page.items) {
        items.push(normalizePlaylistItem(row, items.length));
      }
      nextUrl = page.next;
    }

    return { items, total };
  }

  async runTick(): Promise<AutoSortStatusResponse> {
    if (this.tickPromise) {
      return this.tickPromise;
    }

    this.tickPromise = (async () => {
      const state = this.readState();
      const nowIso = new Date().toISOString();
      state.lastTickAt = nowIso;

      const enabledRules = Object.values(state.rules).filter((r) => r.enabled);
      if (enabledRules.length === 0) {
        state.lastTickError = null;
        this.writeState(state);
        return this.getStatus();
      }

      if (!state.auth || state.auth.status !== "connected") {
        this.writeState(state);
        return this.getStatus();
      }

      try {
        const summaries = await this.fetchPlaylistSummaryMap(state.auth.userId);
        state.lastTickError = null;

        for (const rule of enabledRules) {
          try {
            const summary = summaries.get(rule.playlistId);
            const liveSnapshot = summary
              ? summary.snapshotId
              : (
                  await this.spotifyFetch<{ snapshot_id: string }>(
                    `/playlists/${encodeURIComponent(rule.playlistId)}?fields=snapshot_id`
                  )
                ).snapshot_id;

            if (summary) {
              rule.playlistName = summary.name;
            }
            rule.lastCheckedAt = new Date().toISOString();

            if (rule.lastSnapshotId && rule.lastSnapshotId === liveSnapshot) {
              rule.lastError = null;
              continue;
            }

            const { items, total } = await this.fetchAllItems(rule.playlistId);
            if (items.length !== total) {
              // Playlist changed mid-pagination; retry cleanly on the next tick.
              continue;
            }

            const freshSnapRes = await this.spotifyFetch<{ snapshot_id: string }>(
              `/playlists/${encodeURIComponent(rule.playlistId)}?fields=snapshot_id`
            );
            let activeSnapshotId = freshSnapRes.snapshot_id;

            const preset = rule.preset as AutoSortPresetId;
            if (!isAutoSortPresetId(preset)) {
              rule.lastError = `Unsupported preset "${rule.preset}"`;
              continue;
            }

            const targetEntries = applySortPreset(items, preset);
            const moves = planReorderMoves(
              items.map((e) => e.instanceKey),
              targetEntries.map((e) => e.instanceKey)
            );

            if (moves.length === 0) {
              rule.lastSnapshotId = activeSnapshotId;
              rule.lastError = null;
              continue;
            }

            // Save pre-auto-sort backup on disk BEFORE mutating Spotify.
            const backup = createBackupSnapshot(
              rule.playlistId,
              rule.playlistName,
              activeSnapshotId,
              items,
              "auto_vps"
            );
            this.saveBackup(backup);

            for (let i = 0; i < moves.length; i++) {
              const op = moves[i];
              const putRes = await this.spotifyFetch<{ snapshot_id: string }>(
                `/playlists/${encodeURIComponent(rule.playlistId)}/items`,
                {
                  method: "PUT",
                  body: {
                    range_start: op.range_start,
                    insert_before: op.insert_before,
                    range_length: op.range_length,
                    snapshot_id: activeSnapshotId,
                  },
                }
              );
              activeSnapshotId = putRes.snapshot_id || activeSnapshotId;
              if (i < moves.length - 1 && this.stepDelayMs > 0) {
                await sleep(this.stepDelayMs);
              }
            }

            rule.lastSnapshotId = activeSnapshotId;
            rule.lastSortedAt = new Date().toISOString();
            rule.lastMovesCount = moves.length;
            rule.lastError = null;
          } catch (err) {
            if (err instanceof NeedsReauthError) {
              throw err;
            }
            rule.lastError =
              err instanceof Error ? err.message : "Auto-sort step failed.";
          }
        }
      } catch (err) {
        if (err instanceof NeedsReauthError) {
          // Reload latest state because getValidAccessToken already updated auth.status.
          const latest = this.readState();
          latest.lastTickAt = nowIso;
          this.writeState(latest);
          return this.getStatus();
        }
        state.lastTickError =
          err instanceof Error ? err.message : "Auto-sort check failed.";
      }

      this.writeState(state);
      return this.getStatus();
    })();

    try {
      return await this.tickPromise;
    } finally {
      this.tickPromise = null;
    }
  }
}
