import http from "node:http";
import { AutoSortEngine, NeedsReauthError } from "./autoSortEngine";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.PORT || "3001", 10);
const DATA_DIR = process.env.DATA_DIR || "/var/lib/spotify-sorter";
const POLL_INTERVAL_SECONDS = Math.max(
  30,
  Number.parseInt(process.env.AUTO_SORT_INTERVAL_SECONDS || "120", 10)
);

const engine = new AutoSortEngine({
  dataDir: DATA_DIR,
  pollIntervalSeconds: POLL_INTERVAL_SECONDS,
});

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 64) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve((raw ? JSON.parse(raw) : {}) as T);
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  let url: URL;
  let pathname: string;
  try {
    url = new URL(req.url || "/", `http://${req.headers.host || HOST}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(res, 400, { error: "Malformed URL" });
    return;
  }

  const method = req.method || "GET";

  try {
    if (pathname === "/auto-api/status" && method === "GET") {
      sendJson(res, 200, engine.getStatus());
      return;
    }

    if (pathname === "/auto-api/auth" && method === "POST") {
      const body = await readJsonBody<{
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: number;
        clientId?: string;
        userId?: string;
      }>(req);

      if (
        !body.accessToken ||
        !body.refreshToken ||
        typeof body.expiresAt !== "number" ||
        !body.clientId ||
        !body.userId
      ) {
        sendJson(res, 400, { error: "Missing auth fields." });
        return;
      }

      const status = engine.saveAuth({
        accessToken: body.accessToken,
        refreshToken: body.refreshToken,
        expiresAt: body.expiresAt,
        clientId: body.clientId,
        userId: body.userId,
      });
      sendJson(res, 200, status);
      return;
    }

    if (pathname === "/auto-api/access-token" && method === "GET") {
      const currentToken = url.searchParams.get("current");
      const forceParam = url.searchParams.get("force") === "1";
      const stateAuth = engine.readState().auth;
      const shouldForce =
        forceParam && Boolean(currentToken && stateAuth?.accessToken === currentToken);
      const token = await engine.getValidAccessToken(shouldForce);
      sendJson(res, 200, token);
      return;
    }

    if (pathname === "/auto-api/auth/logout" && method === "POST") {
      sendJson(res, 200, engine.clearAuth());
      return;
    }

    if (pathname === "/auto-api/run-now" && method === "POST") {
      const status = await engine.runTick();
      sendJson(res, 200, status);
      return;
    }

    const ruleMatch = /^\/auto-api\/rules\/([^/]+)$/.exec(pathname);
    if (ruleMatch) {
      const playlistId = ruleMatch[1];
      if (method === "PUT") {
        const body = await readJsonBody<{
          playlistName?: string;
          preset?: string;
          enabled?: boolean;
        }>(req);

        const rule = engine.upsertRule({
          playlistId,
          playlistName: body.playlistName || "Playlist",
          preset: body.preset || "added_desc",
          enabled: Boolean(body.enabled),
        });
        sendJson(res, 200, { rule, status: engine.getStatus() });
        return;
      }
      if (method === "DELETE") {
        engine.deleteRule(playlistId);
        sendJson(res, 200, engine.getStatus());
        return;
      }
    }

    const backupsMatch = /^\/auto-api\/backups\/([^/]+)$/.exec(pathname);
    if (backupsMatch && method === "GET") {
      const backups = engine.listBackups(backupsMatch[1]);
      sendJson(res, 200, { backups });
      return;
    }

    const deleteBackupMatch = /^\/auto-api\/backups\/([^/]+)\/([^/]+)$/.exec(
      pathname
    );
    if (deleteBackupMatch && method === "DELETE") {
      const backups = engine.deleteBackup(
        deleteBackupMatch[1],
        deleteBackupMatch[2]
      );
      sendJson(res, 200, { backups });
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    if (err instanceof NeedsReauthError) {
      sendJson(res, 401, { error: err.message, needsReauth: true });
      return;
    }
    sendJson(res, 500, {
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `spotify-sorter auto-sort service listening on http://${HOST}:${PORT} (poll=${POLL_INTERVAL_SECONDS}s)`
  );
  // Run initial check shortly after boot, then on interval.
  setTimeout(() => {
    void engine.runTick();
  }, 5000);
  setInterval(() => {
    void engine.runTick();
  }, POLL_INTERVAL_SECONDS * 1000);
});
