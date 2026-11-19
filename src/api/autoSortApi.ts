import type {
  AutoSortPlaylistRule,
  AutoSortStatusResponse,
  BackupSnapshot,
} from "../types/spotify";

const UNAVAILABLE_STATUS: AutoSortStatusResponse = {
  available: false,
  authConnected: false,
  authStatus: "disconnected",
  userId: null,
  pollIntervalSeconds: 120,
  isSyncing: false,
  lastTickAt: null,
  lastTickError: null,
  rules: [],
};

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get("content-type") ?? "";
  return ct.toLowerCase().includes("application/json");
}

export async function fetchAutoSortStatus(): Promise<AutoSortStatusResponse> {
  try {
    const res = await fetch("/auto-api/status", { cache: "no-store" });
    if (!res.ok || !isJsonResponse(res)) {
      return UNAVAILABLE_STATUS;
    }
    const json = (await res.json()) as Partial<AutoSortStatusResponse>;
    if (json.available !== true) {
      return UNAVAILABLE_STATUS;
    }
    return json as AutoSortStatusResponse;
  } catch {
    return UNAVAILABLE_STATUS;
  }
}

export async function syncAuthToVps(input: {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  clientId: string;
  userId: string;
}): Promise<AutoSortStatusResponse | null> {
  try {
    const res = await fetch("/auto-api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok || !isJsonResponse(res)) {
      return null;
    }
    return (await res.json()) as AutoSortStatusResponse;
  } catch {
    return null;
  }
}

export type VpsTokenLookupResult =
  | { kind: "ok"; accessToken: string; expiresAt: number }
  | { kind: "needs_reauth" }
  | { kind: "unavailable" };

export async function fetchAccessTokenFromVps(
  currentAccessToken: string,
  force: boolean
): Promise<VpsTokenLookupResult> {
  try {
    const params = new URLSearchParams();
    if (currentAccessToken) params.set("current", currentAccessToken);
    if (force) params.set("force", "1");
    const res = await fetch(`/auto-api/access-token?${params.toString()}`, {
      cache: "no-store",
    });

    if (!isJsonResponse(res)) {
      return { kind: "unavailable" };
    }
    if (res.status === 401) {
      return { kind: "needs_reauth" };
    }
    if (!res.ok) {
      return { kind: "unavailable" };
    }
    const json = (await res.json()) as {
      accessToken?: string;
      expiresAt?: number;
    };
    if (!json.accessToken || typeof json.expiresAt !== "number") {
      return { kind: "unavailable" };
    }
    return {
      kind: "ok",
      accessToken: json.accessToken,
      expiresAt: json.expiresAt,
    };
  } catch {
    return { kind: "unavailable" };
  }
}

export async function disconnectVpsAuth(): Promise<AutoSortStatusResponse> {
  const res = await fetch("/auto-api/auth/logout", { method: "POST" });
  if (!res.ok || !isJsonResponse(res)) {
    throw new Error("Failed to disconnect VPS Auto-Sort session.");
  }
  return (await res.json()) as AutoSortStatusResponse;
}

export async function saveAutoSortRule(
  playlistId: string,
  payload: { playlistName: string; preset: string; enabled: boolean }
): Promise<{ rule: AutoSortPlaylistRule; status: AutoSortStatusResponse }> {
  const res = await fetch(`/auto-api/rules/${encodeURIComponent(playlistId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !isJsonResponse(res)) {
    throw new Error(`Failed to save auto-sort rule (${res.status}).`);
  }
  return (await res.json()) as {
    rule: AutoSortPlaylistRule;
    status: AutoSortStatusResponse;
  };
}

export async function triggerAutoSortRunNow(): Promise<AutoSortStatusResponse> {
  const res = await fetch("/auto-api/run-now", { method: "POST" });
  if (!res.ok || !isJsonResponse(res)) {
    throw new Error(`Auto-sort sync failed (${res.status}).`);
  }
  return (await res.json()) as AutoSortStatusResponse;
}

export async function fetchVpsPlaylistBackups(
  playlistId: string
): Promise<BackupSnapshot[]> {
  try {
    const res = await fetch(
      `/auto-api/backups/${encodeURIComponent(playlistId)}`,
      { cache: "no-store" }
    );
    if (!res.ok || !isJsonResponse(res)) return [];
    const json = (await res.json()) as { backups?: BackupSnapshot[] };
    return Array.isArray(json.backups) ? json.backups : [];
  } catch {
    return [];
  }
}

export async function deleteVpsPlaylistBackup(
  playlistId: string,
  backupId: string
): Promise<BackupSnapshot[]> {
  const res = await fetch(
    `/auto-api/backups/${encodeURIComponent(playlistId)}/${encodeURIComponent(backupId)}`,
    { method: "DELETE" }
  );
  if (!res.ok || !isJsonResponse(res)) {
    throw new Error(`Failed to delete VPS backup (${res.status}).`);
  }
  const json = (await res.json()) as { backups?: BackupSnapshot[] };
  return Array.isArray(json.backups) ? json.backups : [];
}
