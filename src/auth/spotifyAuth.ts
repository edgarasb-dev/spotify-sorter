import {
  fetchAccessTokenFromVps,
  fetchAutoSortStatus,
  syncAuthToVps,
} from "../api/autoSortApi";
import type { SpotifyUser } from "../types/spotify";
import { createCodeChallenge, generateRandomString } from "./pkce";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_ME_URL = "https://api.spotify.com/v1/me";

export const REQUIRED_SCOPES = [
  "user-read-private",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
] as const;

const SESSION_STORAGE_KEY = "spotify_sorter:auth_session:v1";
const CLIENT_ID_STORAGE_KEY = "spotify_sorter:client_id:v1";
const PKCE_PENDING_KEY = "spotify_sorter:pkce_pending:v1";

export interface StoredAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  clientId: string;
}

interface PendingPkceState {
  codeVerifier: string;
  state: string;
  clientId: string;
  redirectUri: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

export class AuthExpiredError extends Error {
  constructor(message = "Spotify session expired. Please sign in again.") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

export class UnauthorizedAccountError extends Error {
  constructor(message = "This Spotify account is not authorized for this personal app.") {
    super(message);
    this.name = "UnauthorizedAccountError";
  }
}

let inFlightRefresh: Promise<StoredAuthSession> | null = null;
let inFlightBootstrap: Promise<SpotifyUser | null> | null = null;

export function isOAuthCallbackUrl(): boolean {
  const { pathname, search } = window.location;
  const params = new URLSearchParams(search);
  return pathname === "/callback" || params.has("code") || params.has("error");
}

export async function bootstrapAuthSession(): Promise<SpotifyUser | null> {
  if (inFlightBootstrap) {
    return inFlightBootstrap;
  }

  inFlightBootstrap = (async () => {
    if (isOAuthCallbackUrl()) {
      return handleSpotifyCallback(window.location.search);
    }

    const existing = loadStoredSession();
    if (!existing) {
      return null;
    }

    return fetchAndVerifyCurrentUser();
  })();

  try {
    return await inFlightBootstrap;
  } finally {
    inFlightBootstrap = null;
  }
}

export function getEnvClientId(): string {
  return (import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "").trim();
}

export function getAllowedUserId(): string {
  return (import.meta.env.VITE_ALLOWED_SPOTIFY_USER_ID ?? "").trim();
}

export function getConfiguredClientId(): string {
  const envId = getEnvClientId();
  if (envId) return envId;
  return (localStorage.getItem(CLIENT_ID_STORAGE_KEY) ?? "").trim();
}

export function setManualClientId(clientId: string): void {
  const trimmed = clientId.trim();
  if (trimmed) {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, trimmed);
  } else {
    localStorage.removeItem(CLIENT_ID_STORAGE_KEY);
  }
}

export function getRedirectUri(): string {
  const envRedirect = (import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? "").trim();
  if (envRedirect) return envRedirect;
  return `${window.location.origin}/callback`;
}

export function isLocalhostOrigin(): boolean {
  return window.location.hostname === "localhost";
}

export function getLoopbackUrl(): string {
  const { protocol, port, pathname, search } = window.location;
  const portSegment = port ? `:${port}` : "";
  return `${protocol}//127.0.0.1${portSegment}${pathname}${search}`;
}

export function loadStoredSession(): StoredAuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.clientId !== "string"
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
      scope: typeof parsed.scope === "string" ? parsed.scope : "",
      clientId: parsed.clientId,
    };
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredAuthSession): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearAuthSession(): void {
  inFlightRefresh = null;
  localStorage.removeItem(SESSION_STORAGE_KEY);
  sessionStorage.removeItem(PKCE_PENDING_KEY);
}

export async function beginSpotifyLogin(manualClientId?: string): Promise<void> {
  if (isLocalhostOrigin() && !(import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? "").trim()) {
    throw new Error(
      `Spotify rejects http://localhost redirect URIs. Open this app at ${getLoopbackUrl()} instead.`
    );
  }

  const clientId = (manualClientId ?? getConfiguredClientId()).trim();
  if (!clientId) {
    throw new Error("Enter your Spotify Developer App Client ID first.");
  }
  if (!getEnvClientId() && manualClientId) {
    setManualClientId(clientId);
  }

  const redirectUri = getRedirectUri();
  const codeVerifier = generateRandomString(64);
  const state = generateRandomString(32);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  const pending: PendingPkceState = {
    codeVerifier,
    state,
    clientId,
    redirectUri,
  };
  sessionStorage.setItem(PKCE_PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: REQUIRED_SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  });

  window.location.assign(`${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`);
}

export async function handleSpotifyCallback(search: string): Promise<SpotifyUser> {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  const errorDescription = params.get("error_description");
  const code = params.get("code");
  const state = params.get("state");

  // Always strip sensitive OAuth query params immediately so a refresh cannot re-use a code.
  window.history.replaceState({}, document.title, "/");

  const pendingRaw = sessionStorage.getItem(PKCE_PENDING_KEY);
  sessionStorage.removeItem(PKCE_PENDING_KEY);

  if (error) {
    throw new Error(errorDescription || `Spotify login failed: ${error}`);
  }

  if (!code || !state) {
    throw new Error("Missing authorization code or state in Spotify callback.");
  }

  if (!pendingRaw) {
    throw new Error("Login state expired or missing. Please sign in again.");
  }

  const pending = JSON.parse(pendingRaw) as PendingPkceState;
  if (pending.state !== state) {
    throw new Error("OAuth state mismatch. Login aborted for security.");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: pending.redirectUri,
    client_id: pending.clientId,
    code_verifier: pending.codeVerifier,
  });

  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Spotify token exchange failed (${response.status}). ${text}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Spotify token response was missing required tokens.");
  }

  const session: StoredAuthSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope ?? "",
    clientId: pending.clientId,
  };
  saveStoredSession(session);

  const user = await verifyCurrentUserAndLock(session.accessToken);
  await syncAuthToVps({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    clientId: session.clientId,
    userId: user.id,
  });
  return user;
}

export async function resyncSessionToVps(userId: string): Promise<boolean> {
  const session = loadStoredSession();
  if (!session) return false;
  const result = await syncAuthToVps({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    clientId: session.clientId,
    userId,
  });
  return Boolean(result?.authConnected);
}

export async function fetchAndVerifyCurrentUser(): Promise<SpotifyUser> {
  const token = await getValidAccessToken();
  const user = await verifyCurrentUserAndLock(token);

  // If VPS auto-sort backend is available and does not have a session yet,
  // sync the existing browser session automatically so the user doesn't have to re-login.
  const vpsStatus = await fetchAutoSortStatus();
  if (vpsStatus.available && !vpsStatus.authConnected) {
    await resyncSessionToVps(user.id);
  }

  return user;
}

async function verifyCurrentUserAndLock(accessToken: string): Promise<SpotifyUser> {
  const response = await fetch(SPOTIFY_ME_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (response.status === 401) {
    const refreshed = await forceRefreshAccessToken(true);
    return verifyCurrentUserAndLock(refreshed.accessToken);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch Spotify profile (${response.status}).`);
  }

  const user = (await response.json()) as SpotifyUser;
  const allowedUserId = getAllowedUserId();
  if (allowedUserId && user.id !== allowedUserId) {
    clearAuthSession();
    throw new UnauthorizedAccountError(
      `Signed-in account "${user.id}" is not allowed on this personal app.`
    );
  }

  return user;
}

export async function getValidAccessToken(): Promise<string> {
  const session = loadStoredSession();
  if (!session) {
    throw new AuthExpiredError();
  }

  // Refresh 60 seconds before expiry.
  if (Date.now() < session.expiresAt - 60_000) {
    return session.accessToken;
  }

  const refreshed = await forceRefreshAccessToken(false);
  return refreshed.accessToken;
}

export async function forceRefreshAccessToken(
  force = true
): Promise<StoredAuthSession> {
  if (inFlightRefresh) {
    return inFlightRefresh;
  }

  inFlightRefresh = (async () => {
    const current = loadStoredSession();
    if (!current || !current.refreshToken) {
      clearAuthSession();
      throw new AuthExpiredError();
    }

    // When deployed behind VPS auto-sort backend, let the VPS perform the
    // single serialized refresh so browser + daemon never race on PKCE refresh tokens.
    const vpsLookup = await fetchAccessTokenFromVps(current.accessToken, force);
    if (vpsLookup.kind === "ok") {
      const updatedFromVps: StoredAuthSession = {
        ...current,
        accessToken: vpsLookup.accessToken,
        expiresAt: vpsLookup.expiresAt,
      };
      saveStoredSession(updatedFromVps);
      return updatedFromVps;
    }
    if (vpsLookup.kind === "needs_reauth") {
      clearAuthSession();
      throw new AuthExpiredError();
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
      client_id: current.clientId,
    });

    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        clearAuthSession();
        throw new AuthExpiredError();
      }
      throw new Error(`Token refresh failed (${response.status}).`);
    }

    const data = (await response.json()) as TokenResponse;
    const updated: StoredAuthSession = {
      accessToken: data.access_token,
      // Spotify may omit refresh_token during refresh; preserve the existing one.
      refreshToken: data.refresh_token ?? current.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      scope: data.scope ?? current.scope,
      clientId: current.clientId,
    };
    saveStoredSession(updated);
    return updated;
  })();

  try {
    return await inFlightRefresh;
  } finally {
    inFlightRefresh = null;
  }
}
